// src/controllers/leaderboardController.js
const db = require('../config/database');

const getLeaderboard = async (req, res) => {
  try {
    const [leaderboard] = await db.execute(
      'SELECT id, username, xp_this_month AS xp, level FROM users ORDER BY xp_this_month DESC, level DESC LIMIT 20'
    );
    res.status(200).json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error fetching leaderboard.' });
  }
};

module.exports = {
  getLeaderboard,
};