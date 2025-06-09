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


const getDailyMissions = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    console.log(`[DEBUG] User ID: ${userId}, Today's Date: ${today}`); // DEBUG

    const [existingDailyMissions] = await connection.execute(
      'SELECT m.id, m.title, m.description, m.xp_reward, m.badge_reward, m.type, dm.is_completed ' +
      'FROM daily_missions dm ' +
      'JOIN missions m ON dm.mission_id = m.id ' +
      'WHERE dm.user_id = ? AND dm.assigned_date = ?',
      [userId, today]
    );
    console.log(`[DEBUG] Existing daily missions count: ${existingDailyMissions.length}`); // DEBUG

    if (existingDailyMissions.length === 0) {
      console.log(`[DEBUG] No existing daily missions, attempting to assign new ones.`); // DEBUG
      // ... (rest of the logic for assigning new missions)

      const [availableMissions] = await connection.execute(
        `SELECT m.id, m.title, m.description, m.xp_reward, m.badge_reward, m.type, m.required_completion_count
         FROM missions m
         LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
         WHERE um.is_completed IS NULL OR um.is_completed = FALSE
         ORDER BY RAND() LIMIT 3`,
        [userId]
      );
      console.log(`[DEBUG] Available missions to assign: ${availableMissions.length}`); // DEBUG

      if (availableMissions.length > 0) {
        for (const mission of availableMissions) {
          console.log(`[DEBUG] Assigning mission ID: ${mission.id}`); // DEBUG
          await connection.execute(
            'INSERT INTO daily_missions (user_id, mission_id, assigned_date, is_completed, current_progress) VALUES (?, ?, ?, FALSE, 0)',
            [userId, mission.id, today]
          );
        }
        // ... (fetch and return newly assigned missions)
      } else {
        console.log(`[DEBUG] No missions available to assign to user ${userId}.`); // DEBUG
        return res.status(200).json([]);
      }
    }

    res.status(200).json(existingDailyMissions);
  } catch (error) {
    console.error('Error fetching daily missions:', error); // DEBUG: Ini adalah error utama
    res.status(500).json({ message: 'Server error fetching daily missions.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const completeMission = async (req, res) => {
  const { missionId, isDailyMission = false } = req.body; 

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

    let userMissionTable = 'user_missions';
    let userMissionCheckCondition = 'user_id = ? AND mission_id = ?';
    let userMissionUpdateValues = [userId, missionId];
    let userMissionInsertValues = [userId, missionId, 1, false, null]; 

    if (isDailyMission) {
      userMissionTable = 'daily_missions';
      const today = new Date().toISOString().slice(0, 10);
      userMissionCheckCondition += ' AND assigned_date = ?';
      userMissionUpdateValues.push(today);
      userMissionInsertValues.push(today);
    }

    const [userMissionRows] = await connection.execute(`SELECT * FROM ${userMissionTable} WHERE ${userMissionCheckCondition} FOR UPDATE`, userMissionUpdateValues);
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
        `UPDATE ${userMissionTable} SET current_progress = ?, is_completed = ?, completed_at = ? WHERE ${userMissionCheckCondition}`,
        [newProgress, isMissionCompleted, isMissionCompleted ? new Date() : null, ...userMissionUpdateValues]
      );
    } else {
      const insertQuery = `INSERT INTO ${userMissionTable} (user_id, mission_id, current_progress, is_completed, completed_at${isDailyMission ? ', assigned_date' : ''}) VALUES (?, ?, ?, ?, ?${isDailyMission ? ', ?' : ''})`;
      await connection.execute(
        insertQuery,
        [userId, missionId, newProgress, isMissionCompleted, isMissionCompleted ? new Date() : null, ...(isDailyMission ? [userMissionInsertValues[5]] : [])]
      );
    }

    let message = 'Mission progress updated.';
    let newLevel = null;
    let xpForNextLevel = null;
    let badgeAwarded = null;

    if (isMissionCompleted) {
      const [userRows] = await connection.execute('SELECT xp, level, xp_this_month FROM users WHERE id = ? FOR UPDATE', [userId]);
      const user = userRows[0];
      let currentXp = user.xp;
      let currentLevel = user.level;
      let currentXpThisMonth = user.xp_this_month || 0;

      let totalXpAfterMission = currentXp + mission.xp_reward;
      let totalXpThisMonthAfterMission = currentXpThisMonth + mission.xp_reward;
      let calculatedLevel = Math.floor(totalXpAfterMission / 100) + 1;

      if (calculatedLevel > currentLevel) {
        newLevel = calculatedLevel;
        message = `Mission "${mission.title}" completed! You earned ${mission.xp_reward} XP and leveled up to Level ${newLevel}!`;
      } else {
        message = `Mission "${mission.title}" completed! You earned ${mission.xp_reward} XP.`;
      }
      xpForNextLevel = (calculatedLevel * 100) - totalXpAfterMission;

      await connection.execute('UPDATE users SET xp = ?, level = ?, xp_this_month = ? WHERE id = ?', [totalXpAfterMission, calculatedLevel, totalXpThisMonthAfterMission, userId]);

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

module.exports = {
  getAllMissions,
  getUserMissions,
  getDailyMissions,
  completeMission,
};