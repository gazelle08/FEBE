// src/controllers/missionController.js
const db = require('../config/database');

const getAllMissions = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [missions] = await connection.execute('SELECT * FROM missions ORDER BY id ASC');
    res.status(200).json(missions);
  } catch (error) {
    console.error('Error fetching missions:', error);
    res.status(500).json({ message: 'Server error fetching missions.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getUserMissions = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;
    const [userMissions] = await connection.execute(`
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
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const completeMission = async (req, res) => {
  const { missionId } = req.body;
  const userId = req.user.id;

  if (!missionId) {
    return res.status(400).json({ message: 'Mission ID is required.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [missionRows] = await connection.execute('SELECT * FROM missions WHERE id = ?', [missionId]);
    const mission = missionRows[0];

    if (!mission) {
      await connection.rollback();
      return res.status(404).json({ message: 'Mission not found.' });
    }

    const [userMissionRows] = await connection.execute('SELECT * FROM user_missions WHERE user_id = ? AND mission_id = ? FOR UPDATE', [userId, missionId]);
    let userMission = userMissionRows[0];

    if (userMission && userMission.is_completed) {
      await connection.rollback();
      return res.status(200).json({ message: 'Mission already completed.', mission });
    }

    let newProgress = (userMission ? userMission.current_progress : 0) + 1;
    let isMissionCompleted = false;

    if (newProgress >= mission.required_completion_count) {
      isMissionCompleted = true;
      newProgress = mission.required_completion_count;
    }

    if (userMission) {
      await connection.execute(
        'UPDATE user_missions SET current_progress = ?, is_completed = ?, completed_at = ? WHERE user_id = ? AND mission_id = ?',
        [newProgress, isMissionCompleted, isMissionCompleted ? new Date() : null, userId, missionId]
      );
    } else {
      await connection.execute(
        'INSERT INTO user_missions (user_id, mission_id, current_progress, is_completed, completed_at) VALUES (?, ?, ?, ?, ?)',
        [userId, missionId, newProgress, isMissionCompleted, isMissionCompleted ? new Date() : null]
      );
    }

    let message = 'Mission progress updated.';
    let newLevel = null;
    let xpForNextLevel = null;
    let badgeAwarded = null;

    if (isMissionCompleted) {
      const [userRows] = await connection.execute('SELECT xp, level FROM users WHERE id = ? FOR UPDATE', [userId]);
      const user = userRows[0];
      let currentXp = user.xp;
      let currentLevel = user.level;

      let totalXpAfterMission = currentXp + mission.xp_reward;
      let calculatedLevel = Math.floor(totalXpAfterMission / 100) + 1;

      if (calculatedLevel > currentLevel) {
        newLevel = calculatedLevel;
        message = `Mission "${mission.title}" completed! You earned ${mission.xp_reward} XP and leveled up to Level ${newLevel}!`;
      } else {
        message = `Mission "${mission.title}" completed! You earned ${mission.xp_reward} XP.`;
      }
      xpForNextLevel = (calculatedLevel * 100) - totalXpAfterMission;

      await connection.execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [totalXpAfterMission, calculatedLevel, userId]);

      if (mission.badge_reward) {
        badgeAwarded = mission.badge_reward;
        message += ` And received the "${mission.badge_reward}" badge!`;
        try {
          await connection.execute(
            'INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE acquired_at = VALUES(acquired_at)',
            [userId, mission.badge_reward]
          );
        } catch (badgeError) {
          console.warn(`Could not award badge ${mission.badge_reward} to user ${userId}: ${badgeError.message}`);
        }
      }
    }

    await connection.commit();

    res.status(200).json({
      message,
      mission_status: {
        missionId: mission.id,
        currentProgress: newProgress,
        isCompleted: isMissionCompleted,
        xpAwarded: isMissionCompleted ? mission.xp_reward : 0,
        badgeAwarded: badgeAwarded
      },
      user_status: {
        newLevel: newLevel,
        xpForNextLevel: xpForNextLevel
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error completing mission:', error);
    res.status(500).json({ message: 'Server error completing mission.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Removed createMission, updateMission, deleteMission functions

module.exports = {
  getAllMissions,
  getUserMissions,
  completeMission,
};