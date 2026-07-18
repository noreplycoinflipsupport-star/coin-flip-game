const express = require('express');
const router = express.Router();
const { register, login, verifyOTP, getMe, updateProfile, updateCurrency, resendOTP, forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
const otpRateMap = new Map();
function otpRateLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const last = otpRateMap.get(key) || 0;
  if (now - last < 5000) {
    return res.status(429).json({ success: false, message: 'Too many attempts. Wait 5 seconds.' });
  }
  otpRateMap.set(key, now);
  next();
}

router.post('/verify-otp', otpRateLimiter, verifyOTP);
router.post('/resend-otp', otpRateLimiter, resendOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);
router.patch('/currency', protect, updateCurrency);

module.exports = router;
