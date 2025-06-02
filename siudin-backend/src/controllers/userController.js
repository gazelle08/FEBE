// src/controllers/userController.js
const db = require('../config/database');

const getUserProfile = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;

    // Removed 'role' from SELECT statement
    const [users] = await connection.execute('SELECT id, username, full_name, email, xp, level, created_at, date_of_birth, education_level, gender FROM users WHERE id = ?', [userId]);
    const user = users[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error fetching user profile.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const updateUserProfile = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;
    // You might want to allow updating fullName, dateOfBirth, educationLevel, gender here as well
    const { username, email } = req.body; // Keeping only username and email for simplicity as per original, but extendable

    if (!username || !email) {
      return res.status(400).json({ message: 'Username and email are required for update.' });
    }

    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?', [username, email, userId]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'Username or email already taken by another user.' });
    }

    const [result] = await connection.execute(
      'UPDATE users SET username = ?, email = ? WHERE id = ?',
      [username, email, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found or no changes made.' });
    }

    res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error updating user profile.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Removed getAllUsers and deleteUser functions

const logVideoWatch = async (req, res) => {
  const { moduleId } = req.body;
  const userId = req.user.id;

  if (!moduleId) {
    return res.status(400).json({ message: 'Module ID is required.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      'INSERT INTO user_video_watches (user_id, module_id) VALUES (?, ?)',
      [userId, moduleId]
    );

    const [watchVideoMissions] = await connection.execute(
      `SELECT id FROM missions WHERE type = 'watch_video'`
    );
    if (watchVideoMissions.length > 0) {
      for (const mission of watchVideoMissions) {
        await connection.execute(
          'INSERT INTO user_missions (user_id, mission_id, current_progress, is_completed, completed_at) VALUES (?, ?, 1, FALSE, NULL) ON DUPLICATE KEY UPDATE current_progress = current_progress + 1',
          [userId, mission.id]
        );
      }
    }

    res.status(200).json({ message: 'Video watch logged successfully.' });
  } catch (error) {
    console.error('Error logging video watch:', error);
    res.status(500).json({ message: 'Server error logging video watch.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getDashboardData = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;

    const [userRows] = await connection.execute('SELECT id, username, full_name, email, xp, level FROM users WHERE id = ?', [userId]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const [completedModulesResult] = await connection.execute(
      'SELECT COUNT(DISTINCT module_id) AS total_completed_modules FROM user_progress WHERE user_id = ? AND is_completed = TRUE',
      [userId]
    );
    const totalCompletedModules = completedModulesResult[0].total_completed_modules;

    const [completedQuizzesResult] = await connection.execute(
      'SELECT COUNT(DISTINCT quiz_id) AS total_quizzes_completed FROM user_quiz_attempts WHERE user_id = ? AND is_correct = TRUE',
      [userId]
    );
    const totalQuizzesCompleted = completedQuizzesResult[0].total_quizzes_completed;

    const [completedMissionsResult] = await connection.execute(
      'SELECT COUNT(DISTINCT mission_id) AS total_completed_missions FROM user_missions WHERE user_id = ? AND is_completed = TRUE',
      [userId]
    );
    const totalCompletedMissions = completedMissionsResult[0].total_completed_missions;

    const [totalVideosWatchedResult] = await connection.execute(
      'SELECT COUNT(id) AS total_videos_watched FROM user_video_watches WHERE user_id = ?',
      [userId]
    );
    const totalVideosWatched = totalVideosWatchedResult[0].total_videos_watched;

    res.status(200).json({
      username: user.username,
      xp: user.xp,
      level: user.level,
      total_modules_completed: totalCompletedModules,
      total_quizzes_completed: totalQuizzesCompleted,
      total_missions_completed: totalCompletedMissions,
      total_videos_watched: totalVideosWatched
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Server error fetching dashboard data.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


module.exports = {
  getUserProfile,
  updateUserProfile,
  logVideoWatch,
  getDashboardData,
};