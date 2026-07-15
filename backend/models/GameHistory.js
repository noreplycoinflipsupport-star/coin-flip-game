const mongoose = require('mongoose');

const gameHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mode: {
    type: String,
    enum: ['real', 'free'],
    required: true
  },
  betAmount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  selectedSide: {
    type: String,
    enum: ['heads', 'tails'],
    required: true
  },
  result: {
    type: String,
    enum: ['heads', 'tails', null],
    default: null
  },
  outcome: {
    type: String,
    enum: ['win', 'loss', 'free', 'pending'],
    default: 'pending'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed'
  },
  commission: {
    type: Number,
    default: 0
  },
  netPayout: {
    type: Number,
    default: 0
  },
  adminForced: {
    type: Boolean,
    default: false
  },
  balanceBefore: { type: Number, default: 0 },
  balanceAfter: { type: Number, default: 0 },
  sessionId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameHistory', gameHistorySchema);
