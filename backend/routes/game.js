const express = require('express');
const router = express.Router();
const { flip, getPendingStatus, getHistory, getStats, checkPending } = require('../controllers/gameController');
const { protect, requireVerified } = require('../middleware/auth');

router.post('/flip', protect, flip);
router.get('/pending-status/:gameId', protect, getPendingStatus);
router.get('/check-pending', protect, checkPending);
router.get('/history', protect, getHistory);
router.get('/stats', protect, getStats);

module.exports = router;
