const User = require('../models/User');
const GameHistory = require('../models/GameHistory');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const GameSession = require('../models/GameSession');

// Per-user rate limiter (1 request per second for free, 1 per 500ms for real)
const rateMap = new Map();
function checkRate(userId, minInterval) {
  const now = Date.now();
  const last = rateMap.get(String(userId)) || 0;
  if (now - last < minInterval) return false;
  rateMap.set(String(userId), now);
  return true;
}

// @route POST /api/game/flip
exports.flip = async (req, res) => {
  try {
    let { selectedSide, betAmount, currency, mode } = req.body;
    if (typeof betAmount === 'boolean' || typeof betAmount === 'object') betAmount = NaN;
    betAmount = Number(betAmount);
    if (isNaN(betAmount) || betAmount < 0) betAmount = 0;
    const settings = await Settings.getSettings();

    if (settings.maintenanceMode) {
      return res.status(503).json({ success: false, message: settings.maintenanceMessage });
    }

    if (!['heads', 'tails'].includes(selectedSide)) {
      return res.status(400).json({ success: false, message: 'Invalid selection. Choose heads or tails.' });
    }

    // --- FREE MODE ---
    if (mode === 'free') {
      if (req.user && !checkRate(req.user._id, 1000)) {
        return res.status(429).json({ success: false, message: 'Too fast! Wait a moment between free bets.' });
      }

      if (settings.freeManualDraw && req.user) {
        const game = await GameHistory.create({
          userId: req.user._id, mode: 'free', betAmount: 0,
          currency: currency || 'INR', selectedSide,
          status: 'pending', outcome: 'pending',
          result: null
        });
        return res.json({
          success: true, mode: 'manual_draw', gameId: game._id,
          message: 'Bet placed. Waiting for admin to declare result.'
        });
      }

      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const outcome = result === selectedSide ? 'win' : 'loss';

      if (req.user) {
        await GameHistory.create({
          userId: req.user._id, mode: 'free', betAmount: 0,
          currency: currency || 'INR', selectedSide, result, outcome: 'free',
          commission: 0, netPayout: 0, adminForced: false
        });
        const inc = outcome === 'win' ? { freeWins: 1 } : { freeLosses: 1 };
        await User.findByIdAndUpdate(req.user._id, { $inc: { freeGames: 1, ...inc } });
      }

      return res.json({ success: true, result, outcome, mode: 'free' });
    }

    // --- REAL MONEY MODE (Session-based) ---
    if (!checkRate(req.user._id, 500)) {
      return res.status(429).json({ success: false, message: 'Too fast! Wait a moment before placing another bet.' });
    }
    if (betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }
    if (betAmount < settings.minBet) {
      return res.status(400).json({ success: false, message: `Minimum bet is ${settings.minBet}` });
    }
    if (betAmount > settings.maxBet) {
      return res.status(400).json({ success: false, message: `Maximum bet is ${settings.maxBet}` });
    }

    const cur = currency || req.user.preferredCurrency || 'INR';
    if (!settings.supportedCurrencies.includes(cur)) {
      return res.status(400).json({ success: false, message: `Unsupported currency: ${cur}` });
    }
    const user = await User.findById(req.user._id);
    const userBalance = user.balance[cur] || 0;

    if (userBalance < betAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Get or ensure current session (with boundary protection)
    const sessionManager = require('../services/sessionManager');
    let session;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (sessionManager.getIsResolving()) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      session = await sessionManager.ensureActiveSession();
      if (session && session.status === 'betting') break;
      await new Promise(r => setTimeout(r, 300));
    }
    if (!session || session.status !== 'betting') {
      return res.status(503).json({ success: false, message: 'Session unavailable, try again' });
    }

    // Create game record first
    const game = await GameHistory.create({
      userId: req.user._id, mode: 'real', betAmount, currency: cur,
      selectedSide, status: 'pending', outcome: 'pending',
      result: null, balanceBefore: userBalance, sessionId: String(session.sessionId)
    });

    // Atomic balance deduction (read-check-write inside serialized queue)
    const updated = await User.atomicDeductBalance(req.user._id, cur, betAmount);
    if (!updated) {
      // Balance was consumed by another request - cancel game
      game.status = 'cancelled';
      await game.save();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    game.balanceAfter = updated.balance[cur];
    await game.save();

    // Log bet transaction
    await Transaction.create({
      userId: req.user._id, type: 'game_bet', amount: betAmount,
      currency: cur, status: 'completed', paymentMethod: 'system'
    });

    res.json({
      success: true, mode: 'session_pending', gameId: game._id,
      message: 'Bet placed. Waiting for round to complete.',
      balance: updated.balance[cur], currency: cur
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/game/pending-status/:gameId
exports.getPendingStatus = async (req, res) => {
  try {
    const game = await GameHistory.findById(req.params.gameId);
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (String(game.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Auto-timeout: if free mode game has been pending > 60s, resolve with random
    if (game.status === 'pending' && game.mode === 'free') {
      const sixtySecAgo = new Date(Date.now() - 60000);
      if (new Date(game.createdAt) < sixtySecAgo) {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const outcome = game.selectedSide === result ? 'win' : 'loss';

        const user = await User.findById(game.userId);
        if (user) {
          if (outcome === 'win') { user.totalWins += 1; user.freeWins += 1; }
          else { user.totalLosses += 1; user.freeLosses += 1; }
          user.totalGames += 1;
          user.freeGames += 1;
          await user.save();
        }

        game.result = result;
        game.outcome = outcome;
        game.status = 'completed';
        await game.save();
      }
    }

    res.json({ success: true, status: game.status, game });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/game/history
exports.getHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const history = await GameHistory.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await GameHistory.countDocuments({ userId: req.user._id });

    res.json({ success: true, history, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/game/check-pending
// Issue G: Check if user has a pending or recently completed game (for page refresh)
exports.checkPending = async (req, res) => {
  try {
    const latest = await GameHistory.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 });

    if (!latest) {
      return res.json({ success: true, hasPending: false, game: null });
    }

    if (latest.status === 'pending') {
      return res.json({ success: true, hasPending: true, game: latest, mode: 'pending' });
    }

    // If completed within last 30 seconds — user might have missed the result
    const thirtySecAgo = new Date(Date.now() - 30000);
    if (latest.status === 'completed' && new Date(latest.createdAt) > thirtySecAgo) {
      return res.json({ success: true, hasPending: true, game: latest, mode: 'recent' });
    }

    res.json({ success: true, hasPending: false, game: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/game/stats?mode=free|real
exports.getStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const mode = req.query.mode || 'all';
    let stats;
    if (mode === 'free') {
      stats = {
        totalGames: user.freeGames,
        totalWins: user.freeWins,
        totalLosses: user.freeLosses,
        totalWagered: 0,
        winRate: user.freeGames > 0 ? ((user.freeWins / user.freeGames) * 100).toFixed(1) : 0
      };
    } else if (mode === 'real') {
      stats = {
        totalGames: user.realGames,
        totalWins: user.realWins,
        totalLosses: user.realLosses,
        totalWagered: user.realWagered,
        winRate: user.realGames > 0 ? ((user.realWins / user.realGames) * 100).toFixed(1) : 0
      };
    } else {
      stats = {
        totalGames: user.totalGames,
        totalWins: user.totalWins,
        totalLosses: user.totalLosses,
        totalWagered: user.totalWagered,
        winRate: user.totalGames > 0 ? ((user.totalWins / user.totalGames) * 100).toFixed(1) : 0
      };
    }
    res.json({ success: true, stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

