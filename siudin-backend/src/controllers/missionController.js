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
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[DEBUG] User ID: ${userId}, Today's Date: ${today}`);

    const [userRows] = await connection.execute('SELECT class_level FROM users WHERE id = ?', [userId]);
    const userClassLevel = userRows[0]?.class_level;

    if (!userClassLevel) {
        console.warn(`User ${userId} has no class_level defined. Cannot assign class-specific daily missions.`);
    }


    const [existingDailyMissions] = await connection.execute(
      'SELECT dm.id AS daily_mission_entry_id, m.id AS mission_id, m.title, m.description, m.xp_reward, m.badge_reward, m.type, m.required_completion_count, dm.is_completed, dm.current_progress ' +
      'FROM daily_missions dm ' +
      'JOIN missions m ON dm.mission_id = m.id ' +
      'WHERE dm.user_id = ? AND dm.assigned_date = ?',
      [userId, today]
    );
    console.log(`[DEBUG] Existing daily missions count: ${existingDailyMissions.length}`);

    if (existingDailyMissions.length === 0) {
      console.log(`[DEBUG] No existing daily missions, attempting to assign new ones.`);

      let missionQuery = `
        SELECT m.id, m.title, m.description, m.xp_reward, m.badge_reward, m.type, m.required_completion_count
        FROM missions m
        LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
        WHERE (um.is_completed IS NULL OR um.is_completed = FALSE) `;

      const missionQueryParams = [userId];

      if (userClassLevel) {
          missionQuery += ` AND (m.class_level IS NULL OR m.class_level = ?) `;
          missionQueryParams.push(userClassLevel);
      }

      missionQuery += ` ORDER BY RAND() LIMIT 3`;


      const [availableMissions] = await connection.execute(missionQuery, missionQueryParams);
      console.log(`[DEBUG] Available missions to assign: ${availableMissions.length}`);

      if (availableMissions.length > 0) {
        for (const mission of availableMissions) {
          console.log(`[DEBUG] Assigning mission ID: ${mission.id} for user ${userId} on ${today}`);
          await connection.execute(
            'INSERT INTO daily_missions (user_id, mission_id, assigned_date, is_completed, current_progress) VALUES (?, ?, ?, FALSE, 0)',
            [userId, mission.id, today]
          );
        }
        const [newlyAssignedMissions] = await connection.execute(
          'SELECT dm.id AS daily_mission_entry_id, m.id AS mission_id, m.title, m.description, m.xp_reward, m.badge_reward, m.type, m.required_completion_count, dm.is_completed, dm.current_progress ' +
          'FROM daily_missions dm ' +
          'JOIN missions m ON dm.mission_id = m.id ' +
          'WHERE dm.user_id = ? AND dm.assigned_date = ?',
          [userId, today]
        );
        return res.status(200).json(newlyAssignedMissions);
      } else {
        console.log(`[DEBUG] No missions available to assign to user ${userId}.`);
        return res.status(200).json([]);
      }
    }

    res.status(200).json(existingDailyMissions);
  } catch (error) {
    console.error('Error fetching daily missions:', error);
    res.status(500).json({ message: 'Server error fetching daily missions.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const completeMission = async (req, res) => {
  const { missionId, isDailyMission = false } = req.body;
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

    let userMissionTable = isDailyMission ? 'daily_missions' : 'user_missions';
    let userMissionCheckCondition = 'user_id = ? AND mission_id = ?';
    let userMissionUpdateValues = [userId, missionId];

    if (isDailyMission) {
      const today = new Date().toISOString().slice(0, 10);
      userMissionCheckCondition += ' AND assigned_date = ?';
      userMissionUpdateValues.push(today);
    }

    const [userMissionRows] = await connection.execute(`SELECT * FROM ${userMissionTable} WHERE ${userMissionCheckCondition} FOR UPDATE`, userMissionUpdateValues);
    let userMission = userMissionRows[0];

    let currentProgress = userMission ? userMission.current_progress : 0;
    let isMissionAlreadyCompleted = userMission ? userMission.is_completed : false;

    if (isDailyMission) {
        if (isMissionAlreadyCompleted) {
            await connection.rollback();
            return res.status(200).json({ message: 'Daily mission already completed (XP and badge already awarded).', mission });
        }
        if (currentProgress >= mission.required_completion_count) {
            await connection.execute(
                `UPDATE ${userMissionTable} SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE ${userMissionCheckCondition}`,
                [...userMissionUpdateValues]
            );
            isMissionAlreadyCompleted = true; 
        }
        if (!isMissionAlreadyCompleted) {
             await connection.rollback();
             return res.status(400).json({ message: 'Daily mission requirements not yet met.' });
        }
    } else { 
        if (isMissionAlreadyCompleted) {
            await connection.rollback();
            return res.status(200).json({ message: 'Mission already completed (XP and badge already awarded).', mission });
        }
        if (currentProgress >= mission.required_completion_count) {
            await connection.execute(
                `UPDATE ${userMissionTable} SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE ${userMissionCheckCondition}`,
                [...userMissionUpdateValues]
            );
            isMissionAlreadyCompleted = true;
        }
        if (!isMissionAlreadyCompleted) {
             await connection.rollback();
             return res.status(400).json({ message: 'Mission requirements not yet met.' });
        }
    }


    let message = 'Mission processed.';
    let newLevel = null;
    let xpForNextLevel = null;
    let badgeAwarded = null;

    if (isMissionAlreadyCompleted && !isDailyMission) {
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
        console.log(`User ${userId} gained ${mission.xp_reward} XP for completing general mission ${mission.id}. Total XP: ${totalXpAfterMission}`);
    } else if (isMissionAlreadyCompleted && isDailyMission) {
        message = `Daily mission "${mission.title}" already completed (XP already awarded).`;
    }

    if (isMissionAlreadyCompleted && mission.badge_reward) {
        badgeAwarded = mission.badge_reward;
        message += ` And received the "${mission.badge_reward}" badge!`;
        try {
            await connection.execute(
                'INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE acquired_at = VALUES(acquired_at)',
                [userId, mission.badge_reward]
            );
            console.log(`User ${userId} awarded badge: ${mission.badge_reward}`);
        } catch (badgeError) {
            console.warn(`Could not award badge ${mission.badge_reward} to user ${userId}: ${badgeError.message}`);
        }
    }


    await connection.commit();

    res.status(200).json({
      message,
      mission_status: {
        missionId: mission.id,
        currentProgress: currentProgress,
        isCompleted: isMissionAlreadyCompleted,
        xpAwarded: (isMissionAlreadyCompleted && !isDailyMission) ? mission.xp_reward : 0, // Hanya tampilkan XP jika baru diberikan untuk misi umum
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