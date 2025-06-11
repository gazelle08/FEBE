// src/controllers/quizController.js
const db = require('../config/database');

const getQuizzesByModuleId = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const { moduleId } = req.params;
    const userId = req.user.id;

    const [progress] = await connection.execute(
      'SELECT is_completed FROM user_progress WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );

    if (!progress[0] || !progress[0].is_completed) {
      return res.status(403).json({ message: 'Module must be completed before accessing its quizzes.' });
    }

    const [quizzes] = await connection.execute('SELECT id, module_id, question, options FROM quizzes WHERE module_id = ?', [moduleId]);
    if (quizzes.length === 0) {
      return res.status(404).json({ message: 'No quizzes found for this module.' });
    }
    res.status(200).json(quizzes);
  } catch (error) {
    console.error('Error fetching quizzes by module ID:', error);
    res.status(500).json({ message: 'Server error fetching quizzes.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const submitQuiz = async (req, res) => {
  const { quizId, userAnswer } = req.body;
  const userId = req.user.id;

  if (!quizId || userAnswer === undefined) {
    return res.status(400).json({ message: 'Quiz ID and user answer are required.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [quizRows] = await connection.execute('SELECT correct_answer, xp_reward, module_id FROM quizzes WHERE id = ?', [quizId]);
    const quiz = quizRows[0];

    if (!quiz) {
      await connection.rollback();
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

    const [userBeforeQuizRows] = await connection.execute('SELECT xp, level, xp_this_month FROM users WHERE id = ? FOR UPDATE', [userId]);
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
      quizResult.correctAnswer = null;

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

      await connection.execute('UPDATE users SET xp = ?, level = ?, xp_this_month = ? WHERE id = ?', [totalXpAfterQuiz, calculatedLevel, totalXpThisMonthAfterQuiz, userId]);
      console.log(`User ${userId} gained ${xpEarned} XP for correct quiz ${quizId}. Total XP: ${totalXpAfterQuiz}`);
      
      currentXp = totalXpAfterQuiz;
      currentLevel = calculatedLevel;
      currentXpThisMonth = totalXpThisMonthAfterQuiz;

    } else {
      message = 'Quiz submitted. Your answer was incorrect.';
    }

    await connection.execute(
      'INSERT INTO user_quiz_attempts (user_id, quiz_id, module_id, is_correct, score) VALUES (?, ?, ?, ?, ?)',
      [userId, quizId, quiz.module_id, isCorrect, xpEarned]
    );

    await connection.execute(
      'INSERT INTO user_progress (user_id, module_id, is_completed, completed_at) VALUES (?, ?, TRUE, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE is_completed = TRUE, completed_at = CURRENT_TIMESTAMP',
      [userId, quiz.module_id]
    );

    const [completeQuizMissions] = await connection.execute(
      `SELECT id, required_completion_count, xp_reward FROM missions WHERE type = 'complete_quiz'`
    );
    if (completeQuizMissions.length > 0) {
      for (const mission of completeQuizMissions) {
        const [userMissionProgress] = await connection.execute(
          'SELECT current_progress, is_completed FROM user_missions WHERE user_id = ? AND mission_id = ? FOR UPDATE',
          [userId, mission.id]
        );
        let currentMissionProgress = userMissionProgress[0]?.current_progress || 0;
        let missionWasCompleted = userMissionProgress[0]?.is_completed || false;

        if (!missionWasCompleted) {
            const newProgress = currentMissionProgress + 1;
            const isMissionNowCompleted = newProgress >= mission.required_completion_count;

            await connection.execute(
              'INSERT INTO user_missions (user_id, mission_id, current_progress, is_completed) VALUES (?, ?, ?, ?) ' +
              'ON DUPLICATE KEY UPDATE current_progress = VALUES(current_progress), is_completed = VALUES(is_completed)',
              [userId, mission.id, newProgress, isMissionNowCompleted]
            );

            if (isMissionNowCompleted && mission.xp_reward > 0) {
                const [userUpdatedRows] = await connection.execute('SELECT xp, level, xp_this_month FROM users WHERE id = ? FOR UPDATE', [userId]);
                const userUpdated = userUpdatedRows[0];
                let totalXpAfterMissionAward = userUpdated.xp + mission.xp_reward;
                let totalXpThisMonthAfterMissionAward = userUpdated.xp_this_month + mission.xp_reward;
                let calculatedLevelAfterMissionAward = Math.floor(totalXpAfterMissionAward / 100) + 1;

                await connection.execute('UPDATE users SET xp = ?, level = ?, xp_this_month = ? WHERE id = ?',
                    [totalXpAfterMissionAward, calculatedLevelAfterMissionAward, totalXpThisMonthAfterMissionAward, userId]);
                console.log(`User ${userId} gained ${mission.xp_reward} XP for completing general quiz mission ${mission.id}. Total XP: ${totalXpAfterMissionAward}`);
            }
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const [dailyCompleteQuizMissions] = await connection.execute(
      `SELECT m.id, m.xp_reward, m.required_completion_count, dm.current_progress, dm.is_completed
       FROM daily_missions dm
       JOIN missions m ON dm.mission_id = m.id
       WHERE dm.user_id = ? AND dm.assigned_date = ? AND m.type = 'complete_quiz' FOR UPDATE`,
      [userId, today]
    );

    if (dailyCompleteQuizMissions.length > 0) {
      for (const mission of dailyCompleteQuizMissions) {
        if (!mission.is_completed) {
            const newDailyProgress = mission.current_progress + 1;
            const isDailyMissionCompleted = newDailyProgress >= mission.required_completion_count;
            await connection.execute(
              'UPDATE daily_missions SET current_progress = ?, is_completed = ?, completed_at = ? WHERE user_id = ? AND mission_id = ? AND assigned_date = ?',
              [newDailyProgress, isDailyMissionCompleted, isDailyMissionCompleted ? new Date() : null, userId, mission.id, today]
            );

            if (isDailyMissionCompleted && mission.xp_reward > 0) {
                const [userUpdatedRows] = await connection.execute('SELECT xp, level, xp_this_month FROM users WHERE id = ? FOR UPDATE', [userId]);
                const userUpdated = userUpdatedRows[0];
                let totalXpAfterDailyMissionAward = userUpdated.xp + mission.xp_reward;
                let totalXpThisMonthAfterDailyMissionAward = userUpdated.xp_this_month + mission.xp_reward;
                let calculatedLevelAfterDailyMissionAward = Math.floor(totalXpAfterDailyMissionAward / 100) + 1;

                await connection.execute('UPDATE users SET xp = ?, level = ?, xp_this_month = ? WHERE id = ?',
                    [totalXpAfterDailyMissionAward, calculatedLevelAfterDailyMissionAward, totalXpThisMonthAfterDailyMissionAward, userId]);
                console.log(`User ${userId} gained ${mission.xp_reward} XP for completing daily quiz mission ${mission.id}. Total XP: ${totalXpAfterDailyMissionAward}`);
            }
        }
      }
    }

    await connection.commit();

    const [finalUserRows] = await connection.execute('SELECT xp, level, xp_this_month FROM users WHERE id = ?', [userId]);
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
    if (connection) {
      await connection.rollback();
    }
    console.error('Error submitting quiz:', error);
    res.status(500).json({ message: 'Server error submitting quiz.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  getQuizzesByModuleId,
  submitQuiz,
};