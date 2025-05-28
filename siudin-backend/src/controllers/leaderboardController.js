// src/controllers/leaderboardController.js
const db = require('../config/database');

const getLeaderboard = async (req, res) => {
  try {
    // Fetch users ordered by XP in descending order
    const [leaderboard] = await db.execute(
      'SELECT id, username, xp, level FROM users ORDER BY xp DESC, level DESC LIMIT 100' // Limit to top 100 for example
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