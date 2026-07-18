const express = require('express');
const router = express.Router();
const { register, login, verifyOTP, getMe, updateProfile, updateCurrency, resendOTP, forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const loginRateMap = new Map();
function loginRateLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = loginRateMap.get(key) || { count: 0, start: now };
  if (now - entry.start > 60000) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count++;
  loginRateMap.set(key, entry);
  if (entry.count > 5) {
    return res.status(429).json({ success: false, message: 'Too many login attempts. Try again after a minute.' });
  }
  next();
}

router.post('/register', register);
router.post('/login', loginRateLimiter, login);
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
const forgotRateMap = new Map();
function forgotRateLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = forgotRateMap.get(key) || { count: 0, start: now };
  if (now - entry.start > 60000) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count++;
  forgotRateMap.set(key, entry);
  if (entry.count > 3) {
    return res.status(429).json({ success: false, message: 'Too many requests. Try again after a minute.' });
  }
  next();
}

router.post('/forgot-password', forgotRateLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/change-password', protect, changePassword);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);
router.patch('/currency', protect, updateCurrency);

setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [key, entry] of loginRateMap) {
    if (entry.start < cutoff) loginRateMap.delete(key);
  }
  for (const [key, ts] of otpRateMap) {
    if (ts < cutoff) otpRateMap.delete(key);
  }
  for (const [key, entry] of forgotRateMap) {
    if (entry.start < cutoff) forgotRateMap.delete(key);
  }
}, 120000);

module.exports = router;
