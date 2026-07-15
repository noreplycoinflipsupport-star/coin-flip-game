const express = require('express');
const router = express.Router();
const { register, login, verifyOTP, getMe, updateProfile, updateCurrency, resendOTP, forgotPassword, resetPassword, changePassword, debug } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/change-password', protect, changePassword);
router.get('/debug', debug);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);
router.patch('/currency', protect, updateCurrency);

module.exports = router;
