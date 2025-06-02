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

    if (userAnswer === quiz.correct_answer) {
      isCorrect = true;
      xpEarned = quiz.xp_reward;
      quizResult.isCorrect = true;
      quizResult.xpEarned = xpEarned;
      quizResult.correctAnswer = null;

      const [userRows] = await connection.execute('SELECT xp, level FROM users WHERE id = ? FOR UPDATE', [userId]);
      const user = userRows[0];
      let currentXp = user.xp;
      let currentLevel = user.level;

      let totalXpAfterQuiz = currentXp + xpEarned;
      let calculatedLevel = Math.floor(totalXpAfterQuiz / 100) + 1;

      if (calculatedLevel > currentLevel) {
        newLevel = calculatedLevel;
        message = `Quiz submitted successfully! You gained ${xpEarned} XP and leveled up to Level ${newLevel}!`;
      } else {
        message = `Quiz submitted successfully! You gained ${xpEarned} XP.`;
      }
      xpForNextLevel = (calculatedLevel * 100) - totalXpAfterQuiz;

      await connection.execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [totalXpAfterQuiz, calculatedLevel, userId]);
    }

    await connection.execute(
      'INSERT INTO user_quiz_attempts (user_id, quiz_id, module_id, is_correct, score) VALUES (?, ?, ?, ?, ?)',
      [userId, quizId, quiz.module_id, isCorrect, isCorrect ? quiz.xp_reward : 0]
    );

    await connection.execute(
      'INSERT INTO user_progress (user_id, module_id, is_completed, completed_at) VALUES (?, ?, TRUE, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE is_completed = TRUE, completed_at = CURRENT_TIMESTAMP',
      [userId, quiz.module_id]
    );

    await connection.commit();

    res.status(200).json({
      message,
      quiz_status: quizResult,
      user_status: {
        newLevel: newLevel,
        xpForNextLevel: xpForNextLevel
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

// Removed createQuiz, updateQuiz, deleteQuiz functions

module.exports = {
  getQuizzesByModuleId,
  submitQuiz,
};