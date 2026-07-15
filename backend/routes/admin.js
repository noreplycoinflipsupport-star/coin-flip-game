const express = require('express');
const router = express.Router();
const {
  getDashboard, getUsers, getUserDetail, updateUser,
  getTransactions, approveTransaction, rejectTransaction,
  getSettings, updateSettings, getGameHistory, createAdmin,
  getPendingFlips, resolveFlips, getPlatformWallet, platformWithdraw,
  getSessionStatus, setSessionResult,
  getPendingFreeFlips, resolveFreeFlips,
  resolveNow, getAutoResolve, toggleAutoResolve,
  getAutoCommission, toggleAutoCommission
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

router.use(protect, adminAuth);

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.get('/users/:id', getUserDetail);
router.patch('/users/:id', updateUser);
router.get('/transactions', getTransactions);
router.patch('/transactions/:id/approve', approveTransaction);
router.patch('/transactions/:id/reject', rejectTransaction);
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);
router.get('/game-history', getGameHistory);
router.post('/create-admin', createAdmin);
router.get('/pending-flips', getPendingFlips);
router.post('/resolve-flips', resolveFlips);
router.get('/pending-free-flips', getPendingFreeFlips);
router.post('/resolve-free-flips', resolveFreeFlips);
router.get('/session-status', getSessionStatus);
router.post('/session-result', setSessionResult);
router.get('/platform-wallet', getPlatformWallet);
router.post('/platform-withdraw', platformWithdraw);
router.post('/resolve-now', resolveNow);
router.get('/auto-resolve', getAutoResolve);
router.post('/auto-resolve', toggleAutoResolve);
router.get('/auto-commission', getAutoCommission);
router.post('/auto-commission', toggleAutoCommission);

module.exports = router;
