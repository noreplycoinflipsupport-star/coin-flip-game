const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Settings = require('../models/Settings');

const WITHDRAWAL_AUTO_EXPIRE_HOURS = 72;

async function autoExpireWithdrawals() {
  try {
    const cutoff = new Date(Date.now() - WITHDRAWAL_AUTO_EXPIRE_HOURS * 60 * 60 * 1000);
    const expired = await Transaction.find({
      type: 'withdrawal', status: 'pending',
      createdAt: { $lt: cutoff }
    });
    for (const t of expired) {
      t.status = 'rejected';
      t.adminNote = 'Auto-cancelled (exceeded 72h processing time)';
      t.processedAt = new Date();
      await t.save();
      const cur = t.currency || 'INR';
      await User.atomicAddBalance(t.userId, cur, t.amount);
    }
    if (expired.length > 0) {
      console.log(`[Auto] ${expired.length} stale withdrawal(s) auto-cancelled`);
    }
  } catch (err) {
    console.error('[Auto] Withdrawal expiry check error:', err.message);
  }
}

// @route POST /api/wallet/deposit
exports.requestDeposit = async (req, res) => {
  try {
    let { amount, currency, paymentMethod, paymentDetails } = req.body;
    amount = Number(amount);
    if (isNaN(amount) || amount < 0) amount = 0;
    const settings = await Settings.getSettings();
    const cur = currency || req.user.preferredCurrency || 'INR';

    if (!amount || amount < settings.minDeposit) {
      return res.status(400).json({ success: false, message: `Minimum deposit is ₹${settings.minDeposit}` });
    }

    const transaction = await Transaction.create({
      userId: req.user._id, type: 'deposit',
      amount, currency: cur, status: 'pending',
      paymentMethod: paymentMethod || 'UPI',
      paymentDetails: paymentDetails || {}
    });

    res.status(201).json({
      success: true,
      message: 'Deposit request submitted. Waiting for admin approval.',
      transactionId: transaction._id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route POST /api/wallet/withdraw
exports.requestWithdrawal = async (req, res) => {
  try {
    let { amount, currency, paymentMethod, paymentDetails } = req.body;
    amount = Number(amount);
    if (isNaN(amount) || amount < 0) amount = 0;
    const settings = await Settings.getSettings();
    const cur = currency || req.user.preferredCurrency || 'INR';

    if (!amount || amount < settings.minWithdrawal) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal is ₹${settings.minWithdrawal}` });
    }

    // Atomic balance deduction
    const updated = await User.atomicDeductBalance(req.user._id, cur, amount);
    if (!updated) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const transaction = await Transaction.create({
      userId: req.user._id, type: 'withdrawal',
      amount, currency: cur, status: 'pending',
      paymentMethod: paymentMethod || 'UPI',
      paymentDetails: paymentDetails || {}
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted. Will be processed within 24 hours.',
      transactionId: transaction._id,
      newBalance: updated.balance[cur]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/wallet/transactions
exports.getTransactions = async (req, res) => {
  try {
    // Auto-cancel stale pending withdrawals
    await autoExpireWithdrawals();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type;

    const filter = { userId: req.user._id };
    if (type) filter.type = type;

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Transaction.countDocuments(filter);

    res.json({ success: true, transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/wallet/balance
exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, balance: user.balance, preferredCurrency: user.preferredCurrency });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports.autoExpireWithdrawals = autoExpireWithdrawals;

