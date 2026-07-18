const User = require('../models/User');
const Transaction = require('../models/Transaction');
const GameHistory = require('../models/GameHistory');
const Settings = require('../models/Settings');
const GameSession = require('../models/GameSession');
const sessionManager = require('../services/sessionManager');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// @route GET /api/admin/dashboard
exports.getDashboard = async (req, res) => {
  try {
    // Auto-cancel stale pending withdrawals
    const { autoExpireWithdrawals } = require('./walletController');
    await autoExpireWithdrawals();

    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [totalUsers, activeUsers, totalGames, todayGames,
      pendingDeposits, pendingWithdrawals, settings] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', status: 'active' }),
      GameHistory.countDocuments(),
      GameHistory.countDocuments({ createdAt: { $gte: today } }),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
      Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),
      Settings.getSettings()
    ]);

    const revenueAgg = await Transaction.aggregate([
      { $match: { type: 'game_loss', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalDepositsAgg = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalWithdrawalsAgg = await Transaction.aggregate([
      { $match: { type: 'withdrawal', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const recentActivity = await Transaction.find()
      .populate('userId', 'name email').sort({ createdAt: -1 }).limit(10);

    res.json({
      success: true,
      stats: {
        totalUsers, activeUsers, totalGames, todayGames,
        pendingDeposits, pendingWithdrawals,
        totalRevenue: revenueAgg[0]?.total || 0,
        totalDeposits: totalDepositsAgg[0]?.total || 0,
        totalWithdrawals: totalWithdrawalsAgg[0]?.total || 0,
        platformBalance: settings.platformBalance,
        platformTotalEarnings: settings.platformTotalEarnings
      },
      settings: {
        commissionPercent: settings.commissionPercent,
        maintenanceMode: settings.maintenanceMode,
        freeManualDraw: settings.freeManualDraw
      },
      recentActivity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/users
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const status = req.query.status;

    const filter = { role: 'user' };
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { phone: { $regex: safe, $options: 'i' } }
      ];
    }
    if (status) filter.status = status;

    const users = await User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await User.countDocuments(filter);

    // Strip sensitive fields from response
    const safeUsers = users.map(u => JSON.parse(JSON.stringify(u))).map(u => {
      delete u.password; delete u.otp; delete u.otpExpiry;
      return u;
    });

    res.json({ success: true, users: safeUsers, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/users/:id
exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const transactions = await Transaction.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(20);
    const gameHistory = await GameHistory.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(20);
    const referrals = await User.find({ referredBy: req.params.id }).select('name email createdAt');

    // Strip sensitive fields
    const safeUser = JSON.parse(JSON.stringify(user));
    delete safeUser.password; delete safeUser.otp; delete safeUser.otpExpiry;
    delete safeUser.resetPasswordToken; delete safeUser.resetPasswordExpiry;

    res.json({ success: true, user: safeUser, transactions, gameHistory, referrals });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route PATCH /api/admin/users/:id
exports.updateUser = async (req, res) => {
  try {
    const { status, role, balanceAdjust, balanceCurrency, balanceNote } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (status) user.status = status;
    if (role) user.role = role;

    if (balanceAdjust && balanceCurrency) {
      const cur = balanceCurrency || 'INR';
      user.balance[cur] = Math.max(0, (user.balance[cur] || 0) + balanceAdjust);
      await user.markModified('balance');

      await Transaction.create({
        userId: user._id,
        type: balanceAdjust > 0 ? 'manual_credit' : 'manual_debit',
        amount: Math.abs(balanceAdjust),
        currency: cur,
        status: 'completed',
        paymentMethod: 'system',
        adminNote: balanceNote || 'Admin adjustment',
        approvedBy: req.user._id
      });
    }

    await user.save();
    res.json({ success: true, message: 'User updated', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/transactions
exports.getTransactions = async (req, res) => {
  try {
    // Auto-cancel stale pending withdrawals
    const { autoExpireWithdrawals } = require('./walletController');
    await autoExpireWithdrawals();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type;
    const status = req.query.status;

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const transactions = await Transaction.find(filter)
      .populate('userId', 'name email phone')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Transaction.countDocuments(filter);

    res.json({ success: true, transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route PATCH /api/admin/transactions/:id/approve
exports.approveTransaction = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const transaction = await Transaction.findById(req.params.id).populate('userId');

    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (transaction.status !== 'pending') return res.status(400).json({ success: false, message: 'Transaction already processed' });

    const user = await User.findById(transaction.userId._id || transaction.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // For deposit: credit user balance (atomic)
    if (transaction.type === 'deposit') {
      const cur = transaction.currency || 'INR';
      await User.atomicAddBalance(transaction.userId._id || transaction.userId, cur, transaction.amount);
    }
    // For withdrawal: balance already deducted on request — just mark as approved

    transaction.status = 'approved';
    transaction.adminNote = adminNote || '';
    transaction.approvedBy = req.user._id;
    transaction.processedAt = new Date();
    await transaction.save();

    res.json({ success: true, message: 'Transaction approved', transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route PATCH /api/admin/transactions/:id/reject
exports.rejectTransaction = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (transaction.status !== 'pending') return res.status(400).json({ success: false, message: 'Transaction already processed' });

    // If withdrawal, refund balance back to user (atomic)
    if (transaction.type === 'withdrawal') {
      const cur = transaction.currency || 'INR';
      await User.atomicAddBalance(transaction.userId, cur, transaction.amount);
    }

    transaction.status = 'rejected';
    transaction.adminNote = adminNote || '';
    transaction.approvedBy = req.user._id;
    transaction.processedAt = new Date();
    await transaction.save();

    res.json({ success: true, message: 'Transaction rejected', transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route PATCH /api/admin/settings
exports.updateSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const allowedFields = [
      'commissionPercent', 'minDeposit', 'minWithdrawal', 'minBet', 'maxBet',
      'referralCommissionPercent', 'referralBonusEnabled',
      'maintenanceMode', 'maintenanceMessage', 'defaultCurrency', 'supportedCurrencies',
      'exchangeRates', 'freeManualDraw', 'announcement', 'announcementEnabled',
      'autoResolve', 'autoCommission'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    });

    if (settings.commissionPercent > 100) settings.commissionPercent = 100;
    if (settings.commissionPercent < 0) settings.commissionPercent = 0;
    if (settings.sessionDuration < 5) settings.sessionDuration = 5;
    if (settings.minBet < 0) settings.minBet = 0;
    if (settings.maxBet < settings.minBet) settings.maxBet = settings.minBet + 1;
    if (settings.referralCommissionPercent > 100) settings.referralCommissionPercent = 100;
    if (settings.referralCommissionPercent < 0) settings.referralCommissionPercent = 0;

    settings.updatedAt = new Date();
    await settings.save();
    res.json({ success: true, message: 'Settings updated', settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/game-history
exports.getGameHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const userId = req.query.userId;

    const filter = {};
    if (userId) filter.userId = userId;

    const history = await GameHistory.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await GameHistory.countDocuments(filter);

    res.json({ success: true, history, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/create-admin
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, phone, password, secret } = req.body;
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ success: false, message: 'Invalid secret' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      existing.role = 'admin';
      await existing.save();
      return res.json({ success: true, message: 'User promoted to admin' });
    }
    const admin = await User.create({ name, email, phone, password, role: 'admin', isEmailVerified: true, status: 'active' });
    res.status(201).json({ success: true, message: 'Admin created', adminId: admin._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/pending-flips
exports.getPendingFlips = async (req, res) => {
  try {
    const pending = await GameHistory.find({ status: 'pending' })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    // Real money stats
    const realHeads = pending.filter(g => g.mode === 'real' && g.selectedSide === 'heads');
    const realTails = pending.filter(g => g.mode === 'real' && g.selectedSide === 'tails');
    // Free mode stats
    const freeHeads = pending.filter(g => g.mode === 'free' && g.selectedSide === 'heads');
    const freeTails = pending.filter(g => g.mode === 'free' && g.selectedSide === 'tails');

    res.json({
      success: true,
      pending,
      stats: {
        headsTotal: realHeads.reduce((s, g) => s + g.betAmount, 0),
        tailsTotal: realTails.reduce((s, g) => s + g.betAmount, 0),
        headsCount: realHeads.length + freeHeads.length,
        tailsCount: realTails.length + freeTails.length,
        totalBets: pending.length,
        totalAmount: realHeads.reduce((s, g) => s + g.betAmount, 0) + realTails.reduce((s, g) => s + g.betAmount, 0),
        freeHeadsCount: freeHeads.length,
        freeTailsCount: freeTails.length,
        realHeadsCount: realHeads.length,
        realTailsCount: realTails.length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/resolve-flips
exports.resolveFlips = async (req, res) => {
  try {
    const { result } = req.body;
    if (!['heads', 'tails'].includes(result)) {
      return res.status(400).json({ success: false, message: 'Result must be heads or tails' });
    }

    // Avoid race with session timer
    const sessionManager = require('../services/sessionManager');
    if (sessionManager.getIsResolving()) {
      return res.status(409).json({ success: false, message: 'Session is currently resolving, try again shortly' });
    }

    const settings = await Settings.getSettings();
    const session = await GameSession.getCurrent();
    if (!session) {
      return res.status(400).json({ success: false, message: 'No active session' });
    }

    // Only resolve current session's pending real-mode games
    const pending = await GameHistory.find({ sessionId: String(session.sessionId), status: 'pending', mode: 'real' });
    if (pending.length === 0) {
      return res.json({ success: true, message: 'No pending flips in current session', resolved: 0 });
    }

    let resolved = 0;
    for (const game of pending) {
      const outcome = result === game.selectedSide ? 'win' : 'loss';
      const user = await User.findById(game.userId);
      if (!user) continue;

      const cur = game.currency || 'INR';
      let netPayout = 0;
      let commission = 0;

      if (outcome === 'win') {
        commission = (game.betAmount * settings.commissionPercent) / 100;
        netPayout = game.betAmount - commission;
        const updatedUserWin = await User.atomicAddBalance(game.userId, cur, netPayout + game.betAmount);
        settings.platformBalance += commission;
        settings.platformTotalEarnings += commission;
        game.balanceAfter = updatedUserWin ? (updatedUserWin.balance?.[cur] || 0) : 0;
      } else {
        settings.platformBalance += game.betAmount;
        settings.platformTotalEarnings += game.betAmount;
        game.balanceAfter = (user.balance?.[cur] || 0);
      }
      const realInc = outcome === 'win' ? { realWins: 1 } : { realLosses: 1 };
      await User.findByIdAndUpdate(game.userId, {
        $inc: { totalWins: outcome === 'win' ? 1 : 0, totalLosses: outcome === 'win' ? 0 : 1, totalGames: 1, totalWagered: game.betAmount, realGames: 1, realWagered: game.betAmount, ...realInc }
      });
      await settings.save();

      game.result = result;
      game.outcome = outcome;
      game.status = 'completed';
      game.adminForced = true;
      game.commission = commission;
      game.netPayout = netPayout;
      await game.save();

      await Transaction.create({
        userId: user._id,
        type: outcome === 'win' ? 'game_win' : 'game_loss',
        amount: outcome === 'win' ? netPayout : game.betAmount,
        currency: cur,
        status: 'completed',
        paymentMethod: 'system'
      });

      if (outcome === 'win' && user.referredBy && settings.referralBonusEnabled) {
        const referralBonus = (game.betAmount * settings.referralCommissionPercent) / 100;
        const referrer = await User.findById(user.referredBy);
        if (referrer && referrer.status === 'active') {
          await User.atomicAddBalance(user.referredBy, cur, referralBonus);
          await User.findByIdAndUpdate(user.referredBy, { $inc: { referralEarnings: referralBonus } });
          await Transaction.create({
            userId: referrer._id, type: 'referral_bonus',
            amount: referralBonus, currency: cur,
            status: 'completed', paymentMethod: 'system'
          });
        }
      }

      resolved++;
    }

    res.json({ success: true, message: `Resolved ${resolved} flips`, resolved, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/pending-free-flips
exports.getPendingFreeFlips = async (req, res) => {
  try {
    const pending = await GameHistory.find({ mode: 'free', status: 'pending' })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    const headsCount = pending.filter(g => g.selectedSide === 'heads').length;
    const tailsCount = pending.filter(g => g.selectedSide === 'tails').length;

    res.json({
      success: true,
      pending,
      stats: { total: pending.length, headsCount, tailsCount }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/resolve-free-flips
exports.resolveFreeFlips = async (req, res) => {
  try {
    const { result } = req.body;
    if (!['heads', 'tails'].includes(result)) {
      return res.status(400).json({ success: false, message: 'Result must be heads or tails' });
    }

    const pending = await GameHistory.find({ mode: 'free', status: 'pending' });
    if (pending.length === 0) {
      return res.json({ success: true, message: 'No pending free flips', resolved: 0 });
    }

    let resolved = 0;
    for (const game of pending) {
      const outcome = game.selectedSide === result ? 'win' : 'loss';
      const user = await User.findById(game.userId);
      if (!user) continue;

      if (outcome === 'win') { user.totalWins += 1; user.freeWins += 1; }
      else { user.totalLosses += 1; user.freeLosses += 1; }
      user.totalGames += 1;
      user.freeGames += 1;
      await user.save();

      game.result = result;
      game.outcome = outcome;
      game.status = 'completed';
      await game.save();
      resolved++;
    }

    res.json({ success: true, message: `Resolved ${resolved} free flips`, resolved, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/session-status
exports.getSessionStatus = async (req, res) => {
  try {
    const session = await GameSession.getCurrent();
    if (!session) {
      return res.json({ success: true, active: false, message: 'No active session' });
    }

    const now = Date.now();
    const endTime = new Date(session.endTime).getTime();
    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

    const pendingGames = await GameHistory.find({ sessionId: String(session.sessionId), status: 'pending' })
      .populate('userId', 'name email');

    const realBets = pendingGames.filter(g => g.mode === 'real');
    const headsReal = realBets.filter(g => g.selectedSide === 'heads');
    const tailsReal = realBets.filter(g => g.selectedSide === 'tails');
    const freeBets = pendingGames.filter(g => g.mode === 'free');

    const stats = {
      totalBets: pendingGames.length,
      realBets: realBets.length,
      freeBets: freeBets.length,
      headsAmount: headsReal.reduce((s, g) => s + g.betAmount, 0),
      tailsAmount: tailsReal.reduce((s, g) => s + g.betAmount, 0),
      headsCount: headsReal.length,
      tailsCount: tailsReal.length,
      freeHeadsCount: freeBets.filter(g => g.selectedSide === 'heads').length,
      freeTailsCount: freeBets.filter(g => g.selectedSide === 'tails').length,
    };

    res.json({
      success: true,
      active: true,
      session: {
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        remaining,
        adminSetResult: session.adminSetResult,
        status: session.status
      },
      pending: pendingGames.map(g => ({
        _id: g._id,
        userId: g.userId,
        mode: g.mode,
        selectedSide: g.selectedSide,
        betAmount: g.betAmount,
        currency: g.currency
      })),
      stats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/session-result
exports.setSessionResult = async (req, res) => {
  try {
    const { result } = req.body;
    if (!['heads', 'tails', null].includes(result)) {
      return res.status(400).json({ success: false, message: 'Result must be heads, tails, or null' });
    }

    if (sessionManager.getIsResolving()) {
      return res.status(409).json({ success: false, message: 'Session is currently resolving, wait for the next round' });
    }

    const session = await GameSession.getCurrent();
    if (!session) {
      return res.status(400).json({ success: false, message: 'No active session' });
    }

    if (session.status === 'ended') {
      return res.status(400).json({ success: false, message: 'Current session has already ended, wait for the next round' });
    }

    session.adminSetResult = result;
    await session.save();

    res.json({
      success: true,
      message: result ? `Next round result set to ${result.toUpperCase()}` : 'Result cleared — will use auto-random',
      adminSetResult: session.adminSetResult,
      sessionId: session.sessionId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/platform-wallet
exports.getPlatformWallet = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const withdrawals = await Transaction.find({ type: 'platform_withdrawal' })
      .sort({ createdAt: -1 }).limit(50);

    res.json({
      success: true,
      balance: settings.platformBalance,
      totalEarnings: settings.platformTotalEarnings,
      withdrawals
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/platform-withdraw
exports.platformWithdraw = async (req, res) => {
  try {
    let { amount, method, details } = req.body;
    amount = Number(amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const settings = await Settings.getSettings();
    if (amount > settings.platformBalance) {
      return res.status(400).json({ success: false, message: 'Insufficient platform balance' });
    }

    settings.platformBalance -= amount;
    await settings.save();

    await Transaction.create({
      userId: req.user._id,
      type: 'platform_withdrawal',
      amount,
      currency: 'INR',
      status: 'completed',
      paymentMethod: method || 'bank_transfer',
      adminNote: `${details || ''} (${method || 'N/A'})`
    });

    res.json({ success: true, message: `Withdrawal of ₹${amount} successful`, balance: settings.platformBalance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/resolve-now
exports.resolveNow = async (req, res) => {
  try {
    const session = await GameSession.getCurrent();
    if (!session || session.status === 'ended') {
      return res.status(400).json({ success: false, message: 'No active session to resolve' });
    }
    const ok = await sessionManager.manualResolve();
    if (ok) {
      res.json({ success: true, message: 'Session resolved manually' });
    } else {
      res.status(409).json({ success: false, message: 'Session is already resolving, try again' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/auto-resolve
exports.getAutoResolve = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ success: true, autoResolve: settings.autoResolve !== false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/auto-resolve
exports.toggleAutoResolve = async (req, res) => {
  try {
    const { enabled } = req.body;
    const settings = await Settings.getSettings();
    settings.autoResolve = enabled !== false;
    await settings.save();
    res.json({ success: true, autoResolve: settings.autoResolve, message: enabled ? 'Auto-resolve ON' : 'Auto-resolve OFF — use Resolve Now manually' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/admin/auto-commission
exports.getAutoCommission = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ success: true, autoCommission: settings.autoCommission === true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/admin/auto-commission
exports.toggleAutoCommission = async (req, res) => {
  try {
    const { enabled } = req.body;
    const settings = await Settings.getSettings();
    settings.autoCommission = enabled === true;
    await settings.save();
    res.json({
      success: true,
      autoCommission: settings.autoCommission,
      message: enabled ? 'Auto-Commission ON — house always wins' : 'Auto-Commission OFF'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

