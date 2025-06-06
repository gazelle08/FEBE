// src/controllers/userController.js
const db = require('../config/database');
const bcrypt = require('bcryptjs'); 

const calculateAge = (dateOfBirth) => {
  const dob = new Date(dateOfBirth);
  const diff_ms = Date.now() - dob.getTime();
  const age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
};

const getUserProfile = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;

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
    const { username, email, full_name, date_of_birth, education_level, gender } = req.body;

    const fieldsToUpdate = [];
    const params = [];
    let age;

    if (username) {
        fieldsToUpdate.push('username = ?');
        params.push(username);
    }
    if (email) {
        fieldsToUpdate.push('email = ?');
        params.push(email);
    }
    if (full_name) {
        fieldsToUpdate.push('full_name = ?');
        params.push(full_name);
    }
    if (date_of_birth) {
        fieldsToUpdate.push('date_of_birth = ?');
        params.push(date_of_birth);
        age = calculateAge(date_of_birth);
        fieldsToUpdate.push('age = ?');
        params.push(age);
    }
    if (education_level) {
        fieldsToUpdate.push('education_level = ?');
        params.push(education_level);
    }
    if (gender) {
        fieldsToUpdate.push('gender = ?');
        params.push(gender);
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    if (username || email) {
      const [existingUsers] = await connection.execute(
        'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
        [username || null, email || null, userId]
      );
      if (existingUsers.length > 0) {
        return res.status(409).json({ message: 'Username or email already taken by another user.' });
      }
    }

    params.push(userId);

    const query = `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

    const [result] = await connection.execute(query, params);

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

const changePassword = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Old password and new password are required.' });
    }

    const [userRows] = await connection.execute('SELECT password FROM users WHERE id = ?', [userId]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Old password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const [result] = await connection.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ message: 'Failed to update password.' });
    }

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Server error changing password.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

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
  changePassword,
  logVideoWatch,
  getDashboardData,
};