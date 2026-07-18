const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

// @route GET /api/referral/my-code
exports.getMyCode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
    res.json({
      success: true,
      referralCode: user.referralCode,
      referralLink: `${baseUrl}/register.html?ref=${user.referralCode}`,
      referralEarnings: user.referralEarnings
    });
  } catch (error) {
    logger.error('ReferralController error', { error: error.message });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/referral/stats
exports.getStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const referredUsers = await User.find({ referredBy: req.user._id })
      .select('name email createdAt totalGames totalWins');
    const referralTransactions = await Transaction.find({
      userId: req.user._id, type: 'referral_bonus'
    }).sort({ createdAt: -1 }).limit(20);

    res.json({
      success: true,
      referralCode: user.referralCode,
      totalReferred: referredUsers.length,
      totalEarnings: user.referralEarnings,
      referredUsers,
      recentBonuses: referralTransactions
    });
  } catch (error) {
    logger.error('ReferralController error', { error: error.message });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @route GET /api/referral/leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await User.aggregate([
      { $match: { role: 'user' } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'referredBy',
          as: 'referrals'
        }
      },
      {
        $project: {
          name: 1,
          referralCode: 1,
          referralEarnings: 1,
          referralCount: { $size: '$referrals' }
        }
      },
      { $sort: { referralCount: -1 } },
      { $limit: 10 }
    ]);

    res.json({ success: true, leaderboard });
  } catch (error) {
    logger.error('ReferralController error', { error: error.message });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

