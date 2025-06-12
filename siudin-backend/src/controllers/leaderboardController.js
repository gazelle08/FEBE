// src/controllers/leaderboardController.js
const supabase = require('../config/database'); 
const getLeaderboard = async (req, res) => {
  try {
    // Fetch leaderboard data
    const { data: leaderboard, error } = await supabase
      .from('users')
      .select('id, username, xp_this_month, level')
      .order('xp_this_month', { ascending: false })
      .order('level', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return res.status(500).json({ message: 'Server error fetching leaderboard.' });
    }

    const formattedLeaderboard = leaderboard.map(user => ({
      id: user.id,
      username: user.username,
      xp: user.xp_this_month,
      level: user.level
    }));

    res.status(200).json(formattedLeaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error fetching leaderboard.' });
  }
};

module.exports = {
  getLeaderboard,
};