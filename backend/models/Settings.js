const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  commissionPercent: { type: Number, default: 5 },
  minDeposit: { type: Number, default: 50 },
  minWithdrawal: { type: Number, default: 200 },
  minBet: { type: Number, default: 50 },
  maxBet: { type: Number, default: 50000 },

  // Referral
  referralCommissionPercent: { type: Number, default: 2 },
  referralBonusEnabled: { type: Boolean, default: true },

  // Maintenance
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, default: 'We are under maintenance. Please check back soon.' },

  // Currency
  defaultCurrency: { type: String, default: 'INR' },
  supportedCurrencies: {
    type: [String],
    default: ['INR', 'USD', 'EUR', 'GBP']
  },
  exchangeRates: {
    // Rates relative to INR
    INR: { type: Number, default: 1 },
    USD: { type: Number, default: 0.012 },
    EUR: { type: Number, default: 0.011 },
    GBP: { type: Number, default: 0.0095 }
  },

  // Manual Draw - Admin controls result in real-time
  manualDraw: { type: Boolean, default: false },
  freeManualDraw: { type: Boolean, default: false },

  // Session Mode
  sessionDuration: { type: Number, default: 10 },
  autoResolve: { type: Boolean, default: true },
  autoCommission: { type: Boolean, default: false },

  // Platform Wallet
  platformBalance: { type: Number, default: 0 },
  platformTotalEarnings: { type: Number, default: 0 },

  // Announcements
  announcement: { type: String, default: '' },
  announcementEnabled: { type: Boolean, default: false },

  updatedAt: { type: Date, default: Date.now }
});

// Ensure only one settings document
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
