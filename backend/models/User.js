const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'banned', 'pending'],
    default: 'active'
  },
  balance: {
    INR: { type: Number, default: 0 },
    USD: { type: Number, default: 0 },
    EUR: { type: Number, default: 0 },
    GBP: { type: Number, default: 0 }
  },
  preferredCurrency: {
    type: String,
    default: 'INR'
  },
  referralCode: {
    type: String,
    unique: true,
    default: () => uuidv4().slice(0, 8).toUpperCase()
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralEarnings: {
    type: Number,
    default: 0
  },
  totalGames: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalLosses: { type: Number, default: 0 },
  totalWagered: { type: Number, default: 0 },
  freeGames: { type: Number, default: 0 },
  freeWins: { type: Number, default: 0 },
  freeLosses: { type: Number, default: 0 },
  realGames: { type: Number, default: 0 },
  realWins: { type: Number, default: 0 },
  realLosses: { type: Number, default: 0 },
  realWagered: { type: Number, default: 0 },
  isEmailVerified: { type: Boolean, default: false },
  otp: { type: String, select: false },
  otpExpiry: { type: Date, select: false },
  resetPasswordToken: { type: String },
  resetPasswordExpiry: { type: Date },
  lastLogin: { type: Date },
  tokenVersion: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Atomic balance operations (prevents race conditions)
userSchema.statics.atomicDeductBalance = async function (userId, currency, amount) {
  const user = await this.findOneAndUpdate(
    { _id: userId, [`balance.${currency}`]: { $gte: amount } },
    { $inc: { [`balance.${currency}`]: -amount } },
    { new: true }
  );
  return user;
};
userSchema.statics.atomicAddBalance = async function (userId, currency, amount) {
  return this.findByIdAndUpdate(userId, { $inc: { [`balance.${currency}`]: amount } }, { new: true });
};

module.exports = mongoose.model('User', userSchema);
