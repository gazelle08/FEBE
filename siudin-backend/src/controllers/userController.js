// src/controllers/userController.js
const supabase = require('../config/database');
const bcrypt = require('bcryptjs');

const calculateAge = (dateOfBirth) => {
  const dob = new Date(dateOfBirth);
  const diff_ms = Date.now() - dob.getTime();
  const age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
};

const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user profile
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, full_name, email, xp, level, created_at, date_of_birth, education_level, gender')
      .eq('id', userId)
      .limit(1);

    if (error) {
      console.error('Error fetching user profile:', error);
      return res.status(500).json({ message: 'Server error fetching user profile.' });
    }

    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error fetching user profile.' });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, full_name, date_of_birth, education_level, gender } = req.body;

    const updates = {};
    let age;

    if (username) {
        updates.username = username;
    }
    if (email) {
        updates.email = email;
    }
    if (full_name) {
        updates.full_name = full_name;
    }
    if (date_of_birth) {
        updates.date_of_birth = date_of_birth;
        age = calculateAge(date_of_birth);
        updates.age = age;
    }
    if (education_level) {
        updates.education_level = education_level;
    }
    if (gender) {
        updates.gender = gender;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    // Check for existing username or email by another user
    if (username || email) {
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .not('id', 'eq', userId);

      if (checkError) throw checkError;

      if (existingUsers && existingUsers.length > 0) {
        return res.status(409).json({ message: 'Username or email already taken by another user.' });
      }
    }

    // Update user profile
    const { error: updateError, count } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id', { count: 'exact' }); // Request count of affected rows

    if (updateError) throw updateError;

    if (count === 0) {
      return res.status(404).json({ message: 'User not found or no changes made.' });
    }

    res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error updating user profile.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Old password and new password are required.' });
    }

    // Fetch user's current password hash
    const { data: userRows, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', userId)
      .limit(1);

    if (fetchError) throw fetchError;
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

    // Update user's password
    const { error: updateError, count } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', userId)
      .select('id', { count: 'exact' });

    if (updateError) throw updateError;

    if (count === 0) {
      return res.status(500).json({ message: 'Failed to update password.' });
    }

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Server error changing password.' });
  }
};

const logVideoWatch = async (req, res) => {
  const { moduleId } = req.body;
  const userId = req.user.id;

  // Log awal permintaan
  console.log(`[logVideoWatch] Diterima permintaan untuk User ID: ${userId}, Module ID: ${moduleId}`);

  if (!moduleId) {
    console.log('[logVideoWatch] Module ID tidak ada.');
    return res.status(400).json({ message: 'Module ID is required.' });
  }

  try {
    // Insert video watch record
    const { error: watchInsertError } = await supabase
      .from('user_video_watches')
      .insert({ user_id: userId, module_id: moduleId });
    if (watchInsertError) console.error('Error inserting video watch record:', watchInsertError);


    // Upsert user progress for the module
    const { error: progressUpsertError } = await supabase
      .from('user_progress')
      .upsert({ user_id: userId, module_id: moduleId, is_completed: true, completed_at: new Date().toISOString() }, { onConflict: 'user_id,module_id' });
    if (progressUpsertError) console.error('Error upserting user progress:', progressUpsertError);


    const videoWatchXp = 10;
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

    let totalXpAfterWatch = currentXp + videoWatchXp;
    let totalXpThisMonthAfterWatch = currentXpThisMonth + videoWatchXp;
    let calculatedLevel = Math.floor(totalXpAfterWatch / 100) + 1;

    // Update user's XP and level
    const { error: updateUserXpError } = await supabase
      .from('users')
      .update({ xp: totalXpAfterWatch, level: calculatedLevel, xp_this_month: totalXpThisMonthAfterWatch })
      .eq('id', userId);
    if (updateUserXpError) console.error('Error updating user XP:', updateUserXpError);
    console.log(`User ${userId} gained ${videoWatchXp} XP for watching video ${moduleId}. Total XP: ${totalXpAfterWatch}`);

    // Update general 'watch_video' missions
    const { data: watchVideoMissions, error: missionsError } = await supabase
      .from('missions')
      .select('id, required_completion_count, xp_reward') // Sertakan xp_reward untuk logging
      .eq('type', 'watch_video');
    if (missionsError) console.error('Error fetching watch_video missions:', missionsError);

    if (watchVideoMissions && watchVideoMissions.length > 0) {
      for (const mission of watchVideoMissions) {
        const { data: userMissionProgress, error: umpError } = await supabase
          .from('user_missions')
          .select('current_progress, is_completed')
          .eq('user_id', userId)
          .eq('mission_id', mission.id)
          .limit(1);
        if (umpError) console.error('Error fetching user mission progress:', umpError);

        let currentMissionProgress = userMissionProgress && userMissionProgress.length > 0 ? userMissionProgress[0].current_progress : 0;
        let missionWasCompleted = userMissionProgress && userMissionProgress.length > 0 ? userMissionProgress[0].is_completed : false;

        if (!missionWasCompleted) { // Only update if not already completed
            const newProgress = currentMissionProgress + 1;
            const isMissionNowCompleted = newProgress >= mission.required_completion_count;

            console.log(`[logVideoWatch] Memperbarui misi umum ID ${mission.id}: Progres baru ${newProgress}/${mission.required_completion_count}, Selesai: ${isMissionNowCompleted}`); // Log untuk misi umum

            const { error: updateUmError } = await supabase
              .from('user_missions')
              .upsert({
                user_id: userId,
                mission_id: mission.id,
                current_progress: newProgress,
                is_completed: isMissionNowCompleted,
                completed_at: isMissionNowCompleted ? new Date().toISOString() : null
              }, { onConflict: 'user_id,mission_id' });
            if (updateUmError) console.error('Error upserting user mission progress:', updateUmError);

            if (isMissionNowCompleted && mission.xp_reward > 0) {
                // Award XP for general mission
                const { data: userAfterMissionRows, error: userAfterMissionError } = await supabase
                  .from('users')
                  .select('xp, level, xp_this_month')
                  .eq('id', userId)
                  .limit(1);
                if (userAfterMissionError) throw userAfterMissionError;
                const userAfterMission = userAfterMissionRows[0];
                let totalXpAfterMissionAward = userAfterMission.xp + mission.xp_reward;
                let totalXpThisMonthAfterMissionAward = userAfterMission.xp_this_month + mission.xp_reward;
                let calculatedLevelAfterMissionAward = Math.floor(totalXpAfterMissionAward / 100) + 1;

                const { error: updateUserXpGeneralMissionError } = await supabase
                  .from('users')
                  .update({ xp: totalXpAfterMissionAward, level: calculatedLevelAfterMissionAward, xp_this_month: totalXpThisMonthAfterMissionAward })
                  .eq('id', userId);
                if (updateUserXpGeneralMissionError) console.error('Error updating user XP after general mission award:', updateUserXpGeneralMissionError);
                console.log(`User ${userId} gained ${mission.xp_reward} XP for completing general video mission ${mission.id}. Total XP: ${totalXpAfterMissionAward}`);
            }
        } else {
            console.log(`[logVideoWatch] Misi umum ID ${mission.id} sudah selesai, tidak ada pembaruan progres.`); // Log untuk misi umum yang sudah selesai
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: dailyWatchVideoMissionsRaw, error: dailyMissionsError } = await supabase
      .from('daily_missions')
      .select(`
        id,
        mission_id,
        current_progress,
        is_completed,
        missions(xp_reward, required_completion_count, type) // Ambil data missions melalui join
      `)
      .eq('user_id', userId)
      .eq('assigned_date', today);

    if (dailyMissionsError) {
        console.error('Error fetching daily watch_video missions:', dailyMissionsError);
        throw dailyMissionsError; 
    }

    // Filter misi harian yang relevan di sisi Node.js setelah data diambil
    const relevantDailyMissions = dailyWatchVideoMissionsRaw.filter(dm => 
        dm.missions && dm.missions.type === 'watch_video'
    );
    console.log(`[logVideoWatch] Misi harian relevan (tipe 'watch_video') yang ditemukan untuk diperbarui: ${relevantDailyMissions.length}`);

    if (relevantDailyMissions && relevantDailyMissions.length > 0) {
      for (const dm of relevantDailyMissions) {
        const xp_reward = dm.missions.xp_reward;
        const required_completion_count = dm.missions.required_completion_count;

        if (!dm.is_completed) {
            const newDailyProgress = dm.current_progress + 1;
            const isDailyMissionCompleted = newDailyProgress >= required_completion_count;

            console.log(`[logVideoWatch] Memperbarui misi harian ID ${dm.id}: Progres baru ${newDailyProgress}/${required_completion_count}, Selesai: ${isDailyMissionCompleted}`); // Log untuk misi harian

            const { error: updateDmError } = await supabase
              .from('daily_missions')
              .update({
                current_progress: newDailyProgress,
                is_completed: isDailyMissionCompleted,
                completed_at: isDailyMissionCompleted ? new Date().toISOString() : null
              })
              .eq('id', dm.id); 
            if (updateDmError) console.error('Error updating daily mission progress:', updateDmError);


            if (isDailyMissionCompleted && xp_reward > 0) {
                const { data: userAfterDailyMissionRows, error: userAfterDailyMissionError } = await supabase
                  .from('users')
                  .select('xp, level, xp_this_month')
                  .eq('id', userId)
                  .limit(1);
                if (userAfterDailyMissionError) throw userAfterDailyMissionError;
                const userAfterDailyMission = userAfterDailyMissionRows[0];

                let totalXpAfterAll = userAfterDailyMission.xp + xp_reward;
                let totalXpThisMonthAfterAll = userAfterDailyMission.xp_this_month + xp_reward;
                let finalCalculatedLevel = Math.floor(totalXpAfterAll / 100) + 1;

                const { error: updateUserXpDailyMissionError } = await supabase
                  .from('users')
                  .update({ xp: totalXpAfterAll, level: finalCalculatedLevel, xp_this_month: totalXpThisMonthAfterAll })
                  .eq('id', userId);
                if (updateUserXpDailyMissionError) console.error('Error updating user XP after daily mission award:', updateUserXpDailyMissionError);
                console.log(`User ${userId} gained ${xp_reward} XP for completing daily video mission ${dm.id}. Total XP: ${totalXpAfterAll}`);
            }
        } else {
            console.log(`[logVideoWatch] Misi harian ID ${dm.id} sudah selesai, tidak ada pembaruan progres.`); 
        }
      }
    } else {
        console.log(`[logVideoWatch] Tidak ada misi harian 'watch_video' yang relevan untuk diperbarui untuk user ${userId} hari ini.`); 
    }

    const { data: finalUserRows, error: finalUserError } = await supabase.from('users').select('xp, level, xp_this_month').eq('id', userId).limit(1);
    if (finalUserError) throw finalUserError;
    const finalUser = finalUserRows[0];

    res.status(200).json({
        message: 'Video watch logged successfully and module marked as completed.',
        user_status: {
            xp: finalUser.xp,
            level: finalUser.level,
            xpThisMonth: finalUser.xp_this_month,
            xpForNextLevel: (finalUser.level * 100) - finalUser.xp
        }
    });
  } catch (error) {
    console.error('Error logging video watch:', error);
    res.status(500).json({ message: 'Server error logging video watch.' });
  }
};

const getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user details
    const { data: userRows, error: userError } = await supabase
      .from('users')
      .select('id, username, full_name, email, xp, level, education_level, xp_this_month')
      .eq('id', userId)
      .limit(1);

    if (userError) throw userError;
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch total completed modules
    const { count: totalCompletedModules, error: completedModulesError } = await supabase
      .from('user_progress')
      .select('module_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_completed', true);
    if (completedModulesError) throw completedModulesError;

    // Fetch total completed quizzes
    const { count: totalQuizzesCompleted, error: completedQuizzesError } = await supabase
      .from('user_quiz_attempts')
      .select('quiz_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_correct', true);
    if (completedQuizzesError) throw completedQuizzesError;

    // Fetch total completed missions
    const { count: totalCompletedMissions, error: completedMissionsError } = await supabase
      .from('user_missions')
      .select('mission_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_completed', true);
    if (completedMissionsError) throw completedMissionsError;

    // Fetch total videos watched
    const { count: totalVideosWatched, error: videosWatchedError } = await supabase
      .from('user_video_watches')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);
    if (videosWatchedError) throw videosWatchedError;


    res.status(200).json({
      username: user.username,
      xp: user.xp,
      level: user.level,
      education_level: user.education_level,
      xp_this_month: user.xp_this_month,
      total_modules_completed: totalCompletedModules,
      total_quizzes_completed: totalQuizzesCompleted,
      total_missions_completed: totalCompletedMissions,
      total_videos_watched: totalVideosWatched
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Server error fetching dashboard data.' });
  }
};


module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  logVideoWatch,
  getDashboardData,
};