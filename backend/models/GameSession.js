const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
  sessionId: { type: Number },
  startTime: { type: Date },
  endTime: { type: Date },
  status: {
    type: String,
    enum: ['betting', 'ended'],
    default: 'betting'
  },
  result: {
    type: String,
    enum: ['heads', 'tails', null],
    default: null
  },
  adminSetResult: {
    type: String,
    enum: ['heads', 'tails', null],
    default: null
  },
  isAuto: { type: Boolean, default: false }
});

gameSessionSchema.statics.getCurrent = async function () {
  return this.findOne({ status: 'betting' });
};

module.exports = mongoose.model('GameSession', gameSessionSchema);
