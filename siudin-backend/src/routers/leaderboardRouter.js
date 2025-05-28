// src/routers/leaderboardRouter.js
const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { verifyToken } = require('../middleware/authMiddleware'); // Assuming leaderboard is public or requires login

// Public route (if anyone can view the leaderboard)
router.get('/', leaderboardController.getLeaderboard);

// Or, if it requires login:
// router.get('/', verifyToken, leaderboardController.getLeaderboard);

module.exports = router;