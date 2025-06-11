// src/routers/leaderboardRouter.js
const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, leaderboardController.getLeaderboard);

module.exports = router;