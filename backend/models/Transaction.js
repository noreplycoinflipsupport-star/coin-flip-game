const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'game_bet', 'game_win', 'game_loss', 'referral_bonus', 'manual_credit', 'manual_debit', 'platform_withdrawal'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['UPI', 'card', 'net_banking', 'crypto', 'bank_transfer', 'system'],
    default: 'system'
  },
  paymentDetails: {
    upiId: String,
    bankAccount: String,
    bankIFSC: String,
    bankName: String,
    cryptoAddress: String,
    transactionRef: String
  },
  adminNote: { type: String },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
