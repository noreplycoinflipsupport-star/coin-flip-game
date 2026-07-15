module.exports = async function seed() {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const User = require('../models/User');
    const Settings = require('../models/Settings');

    const existingSettings = await Settings.findOne();
    if (!existingSettings) {
      await Settings.create({});
      console.log('✅ Default settings created');
    }

    const admin = await User.findOne({ email: 'admin@example.com' });
    if (!admin) {
      await User.create({
        name: 'System Admin',
        email: 'admin@example.com',
        phone: '9999999999',
        password: 'admin123',
        role: 'admin',
        status: 'active',
        balance: { INR: 0, USD: 0, EUR: 0, GBP: 0 },
        preferredCurrency: 'INR',
        referralCode: 'ADMINREF',
        isEmailVerified: true
      });
      console.log('✅ Default admin created');
    }

    const user = await User.findOne({ email: 'user@example.com' });
    if (!user) {
      await User.create({
        name: 'Demo User',
        email: 'user@example.com',
        phone: '9876543210',
        password: 'password123',
        role: 'user',
        status: 'active',
        balance: { INR: 5000, USD: 100, EUR: 100, GBP: 100 },
        preferredCurrency: 'INR',
        referralCode: 'DEMOREF',
        isEmailVerified: true
      });
      console.log('✅ Default demo user created');
    }
  } catch (err) {
    if (err.code === 11000) {
      return;
    }
    console.error('❌ Seed error:', err.message);
  }
};
