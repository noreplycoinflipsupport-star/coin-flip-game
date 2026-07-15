const express = require('express');
const router = express.Router();
const { getMyCode, getStats, getLeaderboard } = require('../controllers/referralController');
const { protect } = require('../middleware/auth');

router.get('/my-code', protect, getMyCode);
router.get('/stats', protect, getStats);
router.get('/leaderboard', protect, getLeaderboard);

module.exports = router;
