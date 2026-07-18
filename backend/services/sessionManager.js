const GameSession = require('../models/GameSession');
const GameHistory = require('../models/GameHistory');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const logger = require('../utils/logger');

let isResolving = false;
let timerRef = null;

async function ensureActiveSession() {
  let session = await GameSession.getCurrent();
  if (!session) {
    session = await createNewSession();
  }
  return session;
}

async function createNewSession() {
  const settings = await Settings.getSettings();
  const all = await GameSession.find({}).sort({ sessionId: -1 });
  const maxId = all.length > 0 ? all[0].sessionId : 0;
  const duration = settings.sessionDuration || 10;

  return GameSession.create({
    sessionId: maxId + 1,
    startTime: new Date(),
    endTime: new Date(Date.now() + duration * 1000),
    status: 'betting'
  });
}

async function resolveCurrentSession() {
  const session = await GameSession.getCurrent();
  if (!session) return false;

  const settings = await Settings.getSettings();
  let result;
  let isAuto = false;

  // Re-read latest adminSetResult from DB (admin may have set it after our initial read)
  const fresh = await GameSession.getCurrent();
  const adminResult = fresh && fresh.adminSetResult;

  if (adminResult && ['heads', 'tails'].includes(adminResult)) {
    result = adminResult;
  } else if (settings.autoCommission) {
    const pendingBets = await GameHistory.find({ sessionId: String(session.sessionId), status: 'pending', mode: 'real' });
    let headsTotal = 0, tailsTotal = 0;
    for (const g of pendingBets) {
      if (g.selectedSide === 'heads') headsTotal += g.betAmount;
      else tailsTotal += g.betAmount;
    }
    if (headsTotal > tailsTotal) result = 'tails';
    else if (tailsTotal > headsTotal) result = 'heads';
    else result = Math.random() < 0.5 ? 'heads' : 'tails';
    isAuto = true;
  } else {
    result = Math.random() < 0.5 ? 'heads' : 'tails';
    isAuto = true;
  }

  const pendingGames = await GameHistory.find({ sessionId: String(session.sessionId), status: 'pending' });

  for (const game of pendingGames) {
    const outcome = game.selectedSide === result ? 'win' : 'loss';
    const user = await User.findById(game.userId);
    if (!user) continue;

    const cur = game.currency || 'INR';
    let netPayout = 0;
    let commission = 0;

    if (game.mode === 'real') {
      if (outcome === 'win') {
        commission = (game.betAmount * settings.commissionPercent) / 100;
        netPayout = game.betAmount - commission;
        const updatedUser = await User.atomicAddBalance(game.userId, cur, netPayout + game.betAmount);
        settings.platformBalance += commission;
        settings.platformTotalEarnings += commission;
        game.balanceAfter = updatedUser ? (updatedUser.balance[cur] || 0) : 0;
      } else {
        settings.platformBalance += game.betAmount;
        settings.platformTotalEarnings += game.betAmount;
        game.balanceAfter = user.balance ? (user.balance[cur] || 0) : 0;
      }
      await User.findByIdAndUpdate(game.userId, {
        $inc: { totalWins: outcome === 'win' ? 1 : 0, totalLosses: outcome === 'win' ? 0 : 1, totalGames: 1, totalWagered: game.betAmount, realWins: outcome === 'win' ? 1 : 0, realLosses: outcome === 'win' ? 0 : 1, realGames: 1, realWagered: game.betAmount }
      });
      await settings.save();
    } else {
      await User.findByIdAndUpdate(game.userId, {
        $inc: { totalWins: outcome === 'win' ? 1 : 0, totalLosses: outcome === 'win' ? 0 : 1, totalGames: 1, freeWins: outcome === 'win' ? 1 : 0, freeLosses: outcome === 'win' ? 0 : 1, freeGames: 1 }
      });
    }

    game.result = result;
    game.outcome = outcome;
    game.status = 'completed';
    game.commission = commission;
    game.netPayout = netPayout;
    await game.save();

    if (game.mode === 'real') {
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
    }
  }

  session.status = 'ended';
  session.result = result;
  session.isAuto = isAuto;
  session.adminSetResult = adminResult || null;
  session.endTime = new Date();
  await session.save();
  return true;
}

async function tick() {
  if (isResolving) return;
  isResolving = true;
  try {
    const resolved = await resolveCurrentSession();
    if (resolved) {
      await createNewSession();
    }
  } catch (err) {
    logger.error('Session tick error', { error: err.message, stack: err.stack });
  } finally {
    isResolving = false;
  }
}

async function getAutoResolveSetting() {
  try {
    const settings = await Settings.getSettings();
    return settings.autoResolve !== false;
  } catch {
    return true;
  }
}

async function manualResolve() {
  if (isResolving) return false;
  isResolving = true;
  try {
    const session = await GameSession.getCurrent();
    if (!session || session.status === 'ended') return false;
    await resolveCurrentSession();
    await createNewSession();
    return true;
  } catch (err) {
    logger.error('Manual resolve error', { error: err.message, stack: err.stack });
    return false;
  } finally {
    isResolving = false;
  }
}

function startSessionTimer() {
  const checkInterval = 2000;
  let lastSessionEnd = 0;

  timerRef = setInterval(async () => {
    try {
      const session = await GameSession.getCurrent();
      if (!session) {
        await createNewSession();
        return;
      }
      const now = Date.now();
      const end = new Date(session.endTime).getTime();
      if (now >= end && String(session._id) !== String(lastSessionEnd)) {
        const autoResolve = await getAutoResolveSetting();
        if (autoResolve) {
          await tick();
          lastSessionEnd = session._id;
        }
      }
    } catch (err) {
      logger.error('Session timer check error', { error: err.message, stack: err.stack });
    }
  }, checkInterval);
}

function getIsResolving() { return isResolving; }

function stopSessionTimer() {
  if (timerRef) {
    clearInterval(timerRef);
    timerRef = null;
  }
}

module.exports = { startSessionTimer, stopSessionTimer, ensureActiveSession, createNewSession, resolveCurrentSession, getIsResolving, manualResolve, getAutoResolveSetting };
