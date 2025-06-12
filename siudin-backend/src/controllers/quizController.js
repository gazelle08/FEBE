// src/controllers/quizController.js
const supabase = require('../config/database'); // Use Supabase client

const getQuizzesByModuleId = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user.id;

    // Check if module is completed by the user
    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('is_completed')
      .eq('user_id', userId)
      .eq('module_id', moduleId)
      .limit(1);

    if (progressError) throw progressError;

    if (!progress || progress.length === 0 || !progress[0].is_completed) {
      return res.status(403).json({ message: 'Module must be completed before accessing its quizzes.' });
    }

    // Fetch quizzes for the module
    const { data: quizzes, error: quizzesError } = await supabase
      .from('quizzes')
      .select('id, module_id, question, options')
      .eq('module_id', moduleId);

    if (quizzesError) throw quizzesError;

    if (!quizzes || quizzes.length === 0) {
      return res.status(404).json({ message: 'No quizzes found for this module.' });
    }
    res.status(200).json(quizzes);
  } catch (error) {
    console.error('Error fetching quizzes by module ID:', error);
    res.status(500).json({ message: 'Server error fetching quizzes.' });
  }
};

const submitQuiz = async (req, res) => {
  const { quizId, userAnswer } = req.body;
  const userId = req.user.id;

  if (!quizId || userAnswer === undefined) {
    return res.status(400).json({ message: 'Quiz ID and user answer are required.' });
  }

  try {
    // Fetch quiz details
    const { data: quizRows, error: quizError } = await supabase
      .from('quizzes')
      .select('correct_answer, xp_reward, module_id')
      .eq('id', quizId)
      .limit(1);

    if (quizError) throw quizError;
    const quiz = quizRows[0];

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found.' });
    }

    let isCorrect = false;
    let xpEarned = 0;
    let message = 'Quiz submitted successfully.';
    let newLevel = null;
    let xpForNextLevel = null;

    const quizResult = {
      isCorrect: false,
      xpEarned: 0,
      correctAnswer: quiz.correct_answer
    };

    // Fetch user data before quiz attempt
    const { data: userBeforeQuizRows, error: userBeforeQuizError } = await supabase
      .from('users')
      .select('xp, level, xp_this_month')
      .eq('id', userId)
      .limit(1);

    if (userBeforeQuizError) throw userBeforeQuizError;
    const userBeforeQuiz = userBeforeQuizRows[0];

    let currentXp = userBeforeQuiz.xp;
    let currentLevel = userBeforeQuiz.level;
    let currentXpThisMonth = userBeforeQuiz.xp_this_month || 0;

    const normalizedCorrectAnswer = String(quiz.correct_answer).trim().toLowerCase();
    const normalizedUserAnswer = String(userAnswer).trim().toLowerCase();

    if (normalizedUserAnswer === normalizedCorrectAnswer) {
      isCorrect = true;
      xpEarned = quiz.xp_reward;
      quizResult.isCorrect = true;
      quizResult.xpEarned = xpEarned;
      quizResult.correctAnswer = null; // Don't expose correct answer if correct

      let totalXpAfterQuiz = currentXp + xpEarned;
      let totalXpThisMonthAfterQuiz = currentXpThisMonth + xpEarned;
      let calculatedLevel = Math.floor(totalXpAfterQuiz / 100) + 1;

      if (calculatedLevel > currentLevel) {
        newLevel = calculatedLevel;
        message = `Quiz submitted successfully! You gained ${xpEarned} XP and leveled up to Level ${newLevel}!`;
      } else {
        message = `Quiz submitted successfully! You gained ${xpEarned} XP.`;
      }
      xpForNextLevel = (calculatedLevel * 100) - totalXpAfterQuiz;

      // Update user XP and level
      const { error: updateUserError } = await supabase
        .from('users')
        .update({ xp: totalXpAfterQuiz, level: calculatedLevel, xp_this_month: totalXpThisMonthAfterQuiz })
        .eq('id', userId);
      if (updateUserError) throw updateUserError;

      console.log(`User ${userId} gained ${xpEarned} XP for correct quiz ${quizId}. Total XP: ${totalXpAfterQuiz}`);

      currentXp = totalXpAfterQuiz;
      currentLevel = calculatedLevel;
      currentXpThisMonth = totalXpThisMonthAfterQuiz;

    } else {
      message = 'Quiz submitted. Your answer was incorrect.';
    }

    // Insert quiz attempt record
    const { error: attemptError } = await supabase
      .from('user_quiz_attempts')
      .insert({
        user_id: userId,
        quiz_id: quizId,
        module_id: quiz.module_id,
        is_correct: isCorrect,
        score: xpEarned
      });
    if (attemptError) console.error('Error inserting quiz attempt:', attemptError);


    // Mark module as completed (if not already) - this seems redundant with logVideoWatch marking progress.
    // If quiz submission also implies module completion, ensure user_progress.is_completed becomes TRUE.
    const { error: progressUpsertError } = await supabase
        .from('user_progress')
        .upsert({ user_id: userId, module_id: quiz.module_id, is_completed: true, completed_at: new Date().toISOString() }, { onConflict: 'user_id,module_id' });
    if (progressUpsertError) console.error('Error upserting user progress for module:', progressUpsertError);


    // Update general 'complete_quiz' missions
    const { data: completeQuizMissions, error: missionsError } = await supabase
      .from('missions')
      .select('id, required_completion_count, xp_reward')
      .eq('type', 'complete_quiz');
    if (missionsError) console.error('Error fetching complete_quiz missions:', missionsError);

    if (completeQuizMissions && completeQuizMissions.length > 0) {
      for (const mission of completeQuizMissions) {
        const { data: userMissionProgress, error: umpError } = await supabase
          .from('user_missions')
          .select('current_progress, is_completed')
          .eq('user_id', userId)
          .eq('mission_id', mission.id)
          .limit(1);
        if (umpError) console.error('Error fetching user mission progress:', umpError);

        let currentMissionProgress = userMissionProgress && userMissionProgress.length > 0 ? userMissionProgress[0].current_progress : 0;
        let missionWasCompleted = userMissionProgress && userMissionProgress.length > 0 ? userMissionProgress[0].is_completed : false;

        if (!missionWasCompleted) {
            const newProgress = currentMissionProgress + 1;
            const isMissionNowCompleted = newProgress >= mission.required_completion_count;

            const { error: updateUmError } = await supabase
              .from('user_missions')
              .upsert({
                user_id: userId,
                mission_id: mission.id,
                current_progress: newProgress,
                is_completed: isMissionNowCompleted,
                completed_at: isMissionNowCompleted ? new Date().toISOString() : null
              }, { onConflict: 'user_id,mission_id' }); // Use upsert to update or insert
            if (updateUmError) console.error('Error upserting user mission progress:', updateUmError);


            if (isMissionNowCompleted && mission.xp_reward > 0) {
                // Award XP for general mission
                const { data: userUpdatedRows, error: userUpdatedError } = await supabase
                  .from('users')
                  .select('xp, level, xp_this_month')
                  .eq('id', userId)
                  .limit(1);
                if (userUpdatedError) throw userUpdatedError;
                const userUpdated = userUpdatedRows[0];
                let totalXpAfterMissionAward = userUpdated.xp + mission.xp_reward;
                let totalXpThisMonthAfterMissionAward = userUpdated.xp_this_month + mission.xp_reward;
                let calculatedLevelAfterMissionAward = Math.floor(totalXpAfterMissionAward / 100) + 1;

                const { error: updateUserXpError } = await supabase
                  .from('users')
                  .update({ xp: totalXpAfterMissionAward, level: calculatedLevelAfterMissionAward, xp_this_month: totalXpThisMonthAfterMissionAward })
                  .eq('id', userId);
                if (updateUserXpError) console.error('Error updating user XP after mission award:', updateUserXpError);
                console.log(`User ${userId} gained ${mission.xp_reward} XP for completing general quiz mission ${mission.id}. Total XP: ${totalXpAfterMissionAward}`);
            }
        }
      }
    }

    // Update daily 'complete_quiz' missions
    const today = new Date().toISOString().slice(0, 10);
    const { data: dailyCompleteQuizMissions, error: dailyMissionsError } = await supabase
      .from('daily_missions')
      .select(`
        id,
        xp_reward,
        required_completion_count,
        current_progress,
        is_completed
      `, {foreignTable: 'missions'}) // Select relevant fields from missions table
      .eq('user_id', userId)
      .eq('assigned_date', today)
      .eq('missions.type', 'complete_quiz'); // Filter by mission type

    if (dailyMissionsError) console.error('Error fetching daily complete_quiz missions:', dailyMissionsError);


    if (dailyCompleteQuizMissions && dailyCompleteQuizMissions.length > 0) {
      for (const dm of dailyCompleteQuizMissions) {
        if (!dm.is_completed) {
            const newDailyProgress = dm.current_progress + 1;
            const isDailyMissionCompleted = newDailyProgress >= dm.required_completion_count;

            const { error: updateDmError } = await supabase
              .from('daily_missions')
              .update({
                current_progress: newDailyProgress,
                is_completed: isDailyMissionCompleted,
                completed_at: isDailyMissionCompleted ? new Date().toISOString() : null
              })
              .eq('id', dm.id); // Update specific daily mission entry by its ID
            if (updateDmError) console.error('Error updating daily mission progress:', updateDmError);


            if (isDailyMissionCompleted && dm.xp_reward > 0) {
                // Award XP for daily mission
                const { data: userUpdatedRows, error: userUpdatedError } = await supabase
                  .from('users')
                  .select('xp, level, xp_this_month')
                  .eq('id', userId)
                  .limit(1);
                if (userUpdatedError) throw userUpdatedError;
                const userUpdated = userUpdatedRows[0];

                let totalXpAfterDailyMissionAward = userUpdated.xp + dm.xp_reward;
                let totalXpThisMonthAfterDailyMissionAward = userUpdated.xp_this_month + dm.xp_reward;
                let calculatedLevelAfterDailyMissionAward = Math.floor(totalXpAfterDailyMissionAward / 100) + 1;

                const { error: updateUserXpDailyError } = await supabase
                  .from('users')
                  .update({ xp: totalXpAfterDailyMissionAward, level: calculatedLevelAfterDailyMissionAward, xp_this_month: totalXpThisMonthAfterDailyMissionAward })
                  .eq('id', userId);
                if (updateUserXpDailyError) console.error('Error updating user XP after daily mission award:', updateUserXpDailyError);
                console.log(`User ${userId} gained ${dm.xp_reward} XP for completing daily quiz mission ${dm.id}. Total XP: ${totalXpAfterDailyMissionAward}`);
            }
        }
      }
    }

    const { data: finalUserRows, error: finalUserError } = await supabase.from('users').select('xp, level, xp_this_month').eq('id', userId).limit(1);
    if (finalUserError) throw finalUserError;
    const finalUser = finalUserRows[0];

    res.status(200).json({
      message,
      quiz_status: quizResult,
      user_status: {
        xp: finalUser.xp,
        level: finalUser.level,
        xpThisMonth: finalUser.xp_this_month,
        xpForNextLevel: (finalUser.level * 100) - finalUser.xp
      }
    });

  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ message: 'Server error submitting quiz.' });
  }
};

module.exports = {
  getQuizzesByModuleId,
  submitQuiz,
};