// src/controllers/missionController.js
const supabase = require('../config/database');

const getAllMissions = async (req, res) => {
  try {
    // Fetch all missions
    const { data: missions, error } = await supabase
      .from('missions')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching missions:', error);
      return res.status(500).json({ message: 'Server error fetching missions.' });
    }

    res.status(200).json(missions);
  } catch (error) {
    console.error('Error fetching missions:', error);
    res.status(500).json({ message: 'Server error fetching missions.' });
  }
};

const getUserMissions = async (req, res) => {
  try {
    const userId = req.user.id;
    // Fetch user's missions and their progress
    const { data: userMissions, error } = await supabase
      .from('missions')
      .select(`
        id,
        title,
        description,
        xp_reward,
        badge_reward,
        type,
        required_completion_count,
        user_missions!left(current_progress, is_completed, completed_at)
      `)
      .eq('user_missions.user_id', userId) // Filter related user_missions for this user
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching user missions:', error);
      return res.status(500).json({ message: 'Server error fetching user missions.' });
    }

    // Adjust the structure to match the original response format
    const formattedUserMissions = userMissions.map(mission => {
      const um = mission.user_missions[0]; // Assuming one user_mission per mission_id for the user
      return {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        xp_reward: mission.xp_reward,
        badge_reward: mission.badge_reward,
        type: mission.type,
        required_completion_count: mission.required_completion_count,
        current_progress: um ? um.current_progress : 0,
        is_completed: um ? um.is_completed : false,
        completed_at: um ? um.completed_at : null
      };
    });

    res.status(200).json(formattedUserMissions);
  } catch (error) {
    console.error('Error fetching user missions:', error);
    res.status(500).json({ message: 'Server error fetching user missions.' });
  }
};


const getDailyMissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // Fetch user's class level to potentially filter missions
    const { data: userRows, error: userError } = await supabase
      .from('users')
      .select('class_level')
      .eq('id', userId)
      .limit(1);

    if (userError) throw userError;
    const userClassLevel = userRows[0]?.class_level;

    // Check for existing daily missions for today
    const { data: existingDailyMissions, error: dailyMissionsError } = await supabase
      .from('daily_missions')
      .select(`
        id,
        mission_id,
        assigned_date,
        is_completed,
        current_progress,
        missions(title, description, xp_reward, badge_reward, type, required_completion_count)
      `)
      .eq('user_id', userId)
      .eq('assigned_date', today);

    if (dailyMissionsError) throw dailyMissionsError;

    // Format the response to match the original structure
    const formattedDailyMissions = existingDailyMissions.map(dm => ({
      daily_mission_entry_id: dm.id,
      mission_id: dm.mission_id,
      title: dm.missions.title,
      description: dm.missions.description,
      xp_reward: dm.missions.xp_reward,
      badge_reward: dm.missions.badge_reward,
      type: dm.missions.type,
      required_completion_count: dm.missions.required_completion_count,
      is_completed: dm.is_completed,
      current_progress: dm.current_progress
    }));

    res.status(200).json(formattedDailyMissions);
  } catch (error) {
    console.error('Error fetching daily missions:', error);
    res.status(500).json({ message: 'Server error fetching daily missions.' });
  }
};


const completeMission = async (req, res) => {
  const { missionId, isDailyMission = false } = req.body;
  const userId = req.user.id;

  if (!missionId) {
    return res.status(400).json({ message: 'Mission ID is required.' });
  }

  try {
    // Fetch mission details
    const { data: missionRows, error: missionError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .limit(1);

    if (missionError) throw missionError;
    const mission = missionRows[0];

    if (!mission) {
      return res.status(404).json({ message: 'Mission not found.' });
    }

    let userMissionData = null;
    let queryTargetTable = isDailyMission ? 'daily_missions' : 'user_missions';
    let queryFilter = { user_id: userId, mission_id: missionId };

    if (isDailyMission) {
      queryFilter.assigned_date = new Date().toISOString().slice(0, 10);
    }

    // Fetch user's current mission progress
    const { data: userMissionRows, error: userMissionError } = await supabase
      .from(queryTargetTable)
      .select('current_progress, is_completed')
      .match(queryFilter)
      .limit(1);

    if (userMissionError) throw userMissionError;
    userMissionData = userMissionRows[0];

    let currentProgress = userMissionData ? userMissionData.current_progress : 0;
    let isMissionAlreadyCompleted = userMissionData ? userMissionData.is_completed : false;

    if (isMissionAlreadyCompleted) {
      return res.status(200).json({ message: 'Mission already completed (XP and badge already awarded).', mission });
    }

    // Supabase does not have explicit locks like MySQL's FOR UPDATE.
    // Optimistic concurrency or database functions are typically used for this.
    // For simplicity, we assume conflicts are rare or handled by upsert behavior.

    if (currentProgress < mission.required_completion_count) {
      return res.status(400).json({ message: 'Mission requirements not yet met.' });
    }

    // Update mission status to completed
    const { error: updateStatusError } = await supabase
      .from(queryTargetTable)
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .match(queryFilter);

    if (updateStatusError) throw updateStatusError;

    isMissionAlreadyCompleted = true; // Mark as completed for this request's logic

    let message = 'Mission processed.';
    let newLevel = null;
    let xpForNextLevel = null;
    let badgeAwarded = null;

    if (isMissionAlreadyCompleted) {
        // Fetch user's current XP and level for update
        const { data: userRows, error: userFetchError } = await supabase
            .from('users')
            .select('xp, level, xp_this_month')
            .eq('id', userId)
            .limit(1);
        if (userFetchError) throw userFetchError;
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

        // Update user XP and level
        const { error: updateUserError } = await supabase
            .from('users')
            .update({ xp: totalXpAfterMission, level: calculatedLevel, xp_this_month: totalXpThisMonthAfterMission })
            .eq('id', userId);
        if (updateUserError) throw updateUserError;

        console.log(`User ${userId} gained ${mission.xp_reward} XP for completing mission ${mission.id}. Total XP: ${totalXpAfterMission}`);


      if (mission.badge_reward) {
          badgeAwarded = mission.badge_reward;
          message += ` And received the "${mission.badge_reward}" badge!`;
          try {
              // Upsert user badge to avoid duplicates
              const { error: badgeUpsertError } = await supabase
                  .from('user_badges')
                  .upsert({ user_id: userId, badge_name: mission.badge_reward, acquired_at: new Date().toISOString() }, { onConflict: 'user_id,badge_name' });
              if (badgeUpsertError) throw badgeUpsertError;
              console.log(`User ${userId} awarded badge: ${mission.badge_reward}`);
          } catch (badgeError) {
              console.warn(`Could not award badge ${mission.badge_reward} to user ${userId}: ${badgeError.message}`);
          }
      }
    }


    res.status(200).json({
      message,
      mission_status: {
        missionId: mission.id,
        currentProgress: currentProgress, // This progress is from before this completion, ideally would be mission.required_completion_count
        isCompleted: isMissionAlreadyCompleted,
        xpAwarded: isMissionAlreadyCompleted ? mission.xp_reward : 0,
        badgeAwarded: badgeAwarded
      },
      user_status: {
        newLevel: newLevel,
        xpForNextLevel: xpForNextLevel
      }
    });

  } catch (error) {
    console.error('Error completing mission:', error);
    res.status(500).json({ message: 'Server error completing mission.' });
  }
};

module.exports = {
  getAllMissions,
  getUserMissions,
  getDailyMissions,
  completeMission,
};