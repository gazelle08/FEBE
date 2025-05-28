// src/controllers/missionController.js
const db = require('../config/database');

const getAllMissions = async (req, res) => {
  try {
    const [missions] = await db.execute('SELECT * FROM missions ORDER BY id ASC');
    res.status(200).json(missions);
  } catch (error) {
    console.error('Error fetching missions:', error);
    res.status(500).json({ message: 'Server error fetching missions.' });
  }
};

const getUserMissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const [userMissions] = await db.execute(`
      SELECT
        m.id,
        m.title,
        m.description,
        m.xp_reward,
        m.badge_reward,
        m.type,
        m.required_completion_count,
        um.current_progress,
        um.is_completed,
        um.completed_at
      FROM missions m
      LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
      ORDER BY m.id ASC;
    `, [userId]);

    res.status(200).json(userMissions);
  } catch (error) {
    console.error('Error fetching user missions:', error);
    res.status(500).json({ message: 'Server error fetching user missions.' });
  }
};

const completeMission = async (req, res) => {
  const { missionId } = req.body;
  const userId = req.user.id;

  if (!missionId) {
    return res.status(400).json({ message: 'Mission ID is required.' });
  }

  try {
    // Get mission details
    const [missionRows] = await db.execute('SELECT * FROM missions WHERE id = ?', [missionId]);
    const mission = missionRows[0];

    if (!mission) {
      return res.status(404).json({ message: 'Mission not found.' });
    }

    // Get user's current mission progress
    const [userMissionRows] = await db.execute('SELECT * FROM user_missions WHERE user_id = ? AND mission_id = ?', [userId, missionId]);
    let userMission = userMissionRows[0];

    if (userMission && userMission.is_completed) {
      return res.status(200).json({ message: 'Mission already completed.', mission });
    }

    // Increment progress (or set to required_completion_count if it's a one-off type mission)
    let newProgress = (userMission ? userMission.current_progress : 0) + 1;
    let isMissionCompleted = false;

    if (newProgress >= mission.required_completion_count) {
        isMissionCompleted = true;
        newProgress = mission.required_completion_count; // Cap progress at max
    }

    if (userMission) {
      await db.execute(
        'UPDATE user_missions SET current_progress = ?, is_completed = ?, completed_at = ? WHERE user_id = ? AND mission_id = ?',
        [newProgress, isMissionCompleted, isMissionCompleted ? new Date() : null, userId, missionId]
      );
    } else {
      await db.execute(
        'INSERT INTO user_missions (user_id, mission_id, current_progress, is_completed, completed_at) VALUES (?, ?, ?, ?, ?)',
        [userId, missionId, newProgress, isMissionCompleted, isMissionCompleted ? new Date() : null]
      );
    }

    let message = 'Mission progress updated.';
    if (isMissionCompleted) {
      // Award XP to user
      // Simple Leveling Logic (adjust as needed, bisa disatukan dengan logic di quizController atau pakai yang ini)
      await db.execute('UPDATE users SET xp = xp + ?, level = (CASE WHEN xp + ? >= level * 100 THEN level + 1 ELSE level END) WHERE id = ?',
        [mission.xp_reward, mission.xp_reward, userId]);

      message = `Mission "${mission.title}" completed! You earned ${mission.xp_reward} XP.`;
      if (mission.badge_reward) {
        message += ` And received the "${mission.badge_reward}" badge!`;
        // In a real app, you'd also save badge to a user_badges table.
      }
    }

    res.status(200).json({
      message,
      mission_status: {
        missionId: mission.id,
        currentProgress: newProgress,
        isCompleted: isMissionCompleted,
        xpAwarded: isMissionCompleted ? mission.xp_reward : 0,
        badgeAwarded: isMissionCompleted ? mission.badge_reward : null
      }
    });

  } catch (error) {
    console.error('Error completing mission:', error);
    res.status(500).json({ message: 'Server error completing mission.' });
  }
};

const createMission = async (req, res) => {
  // Admin only
  const { title, description, xp_reward, badge_reward, type, required_completion_count } = req.body;

  if (!title || !description || xp_reward === undefined || !type || required_completion_count === undefined) {
    return res.status(400).json({ message: 'All mission fields (title, description, xp_reward, type, required_completion_count) are required.' });
  }
  if (!['watch_video', 'complete_quiz', 'daily_login'].includes(type)) {
    return res.status(400).json({ message: 'Invalid mission type.' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO missions (title, description, xp_reward, badge_reward, type, required_completion_count) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, xp_reward, badge_reward, type, required_completion_count]
    );
    res.status(201).json({ message: 'Mission created successfully.', missionId: result.insertId });
  } catch (error) {
    console.error('Error creating mission:', error);
    res.status(500).json({ message: 'Server error creating mission.' });
  }
};

const updateMission = async (req, res) => {
  // Admin only
  const { id } = req.params;
  const { title, description, xp_reward, badge_reward, type, required_completion_count } = req.body;

  const fieldsToUpdate = [];
  const params = [];

  if (title) { fieldsToUpdate.push('title = ?'); params.push(title); }
  if (description) { fieldsToUpdate.push('description = ?'); params.push(description); }
  if (xp_reward !== undefined) { fieldsToUpdate.push('xp_reward = ?'); params.push(xp_reward); }
  if (badge_reward !== undefined) { fieldsToUpdate.push('badge_reward = ?'); params.push(badge_reward); }
  if (type) {
    if (!['watch_video', 'complete_quiz', 'daily_login'].includes(type)) {
      return res.status(400).json({ message: 'Invalid mission type.' });
    }
    fieldsToUpdate.push('type = ?'); params.push(type);
  }
  if (required_completion_count !== undefined) { fieldsToUpdate.push('required_completion_count = ?'); params.push(required_completion_count); }

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  params.push(id); // Add mission ID for WHERE clause

  try {
    const query = `UPDATE missions SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
    const [result] = await db.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Mission not found or no changes made.' });
    }
    res.status(200).json({ message: 'Mission updated successfully.' });
  } catch (error) {
    console.error('Error updating mission:', error);
    res.status(500).json({ message: 'Server error updating mission.' });
  }
};

const deleteMission = async (req, res) => {
  // Admin only
  const { id } = req.params;
  try {
    const [result] = await db.execute('DELETE FROM missions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Mission not found.' });
    }
    res.status(200).json({ message: 'Mission deleted successfully.' });
  } catch (error) {
    console.error('Error deleting mission:', error);
    res.status(500).json({ message: 'Server error deleting mission.' });
  }
};


module.exports = {
  getAllMissions,
  getUserMissions,
  completeMission,
  createMission,
  updateMission,
  deleteMission,
};