const express = require('express');
const router = express.Router();
const { requestDeposit, requestWithdrawal, getTransactions, getBalance } = require('../controllers/walletController');
const { protect, requireVerified } = require('../middleware/auth');

router.post('/deposit', protect, requireVerified, requestDeposit);
router.post('/withdraw', protect, requireVerified, requestWithdrawal);
router.get('/transactions', protect, getTransactions);
router.get('/balance', protect, getBalance);

module.exports = router;
