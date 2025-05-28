// src/controllers/quizController.js
const db = require('../config/database');

const getQuizzesByModuleId = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user.id; // Diperlukan untuk cek progres, pastikan rute di router diproteksi dengan verifyToken

    // OPSI: Validasi jika modul belum selesai, kuis tidak bisa diakses
    const [progress] = await db.execute(
      'SELECT is_completed FROM user_progress WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );

    // Jika user_progress tidak ada atau is_completed false, berarti modul belum selesai
    if (!progress[0] || !progress[0].is_completed) {
      return res.status(403).json({ message: 'Module must be completed before accessing its quizzes.' });
    }

    const [quizzes] = await db.execute('SELECT id, module_id, question, options FROM quizzes WHERE module_id = ?', [moduleId]); // Don't expose correct_answer
    if (quizzes.length === 0) {
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

  if (!quizId || !userAnswer) {
    return res.status(400).json({ message: 'Quiz ID and user answer are required.' });
  }

  try {
    const [quizRows] = await db.execute('SELECT correct_answer, xp_reward, module_id FROM quizzes WHERE id = ?', [quizId]);
    const quiz = quizRows[0];

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found.' });
    }

    let isCorrect = false;
    let xpEarned = 0;
    const quizResult = {
      isCorrect: false,
      xpEarned: 0,
      correctAnswer: quiz.correct_answer // Optionally send back the correct answer
    };

    if (userAnswer === quiz.correct_answer) {
      isCorrect = true;
      xpEarned = quiz.xp_reward;
      quizResult.isCorrect = true;
      quizResult.xpEarned = xpEarned;

      // Update user's XP and Level
      const [userRows] = await db.execute('SELECT xp, level FROM users WHERE id = ?', [userId]);
      const user = userRows[0];
      let newXp = user.xp + xpEarned;
      let newLevel = user.level;

      // Simple Leveling Logic (adjust as needed)
      // Leveling up if current XP + earned XP is enough
      // For example, Level 1 needs 100 XP, Level 2 needs 200 XP (total 300 from start)
      // A common method is: nextLevelXP = currentLevel * 100;
      // If newXp >= nextLevelXP, then level up.
      // Or, simply calculate level based on current XP: newLevel = Math.floor(newXp / 100) + 1;
      // Keeping your original logic:
      if (newXp >= newLevel * 100) {
        newLevel++;
        newXp = newXp - (newLevel - 1) * 100; // Reset XP for new level or carry over remainder
        // Jika Anda ingin XP terus bertambah tanpa reset per level, gunakan:
        // newXp = newXp; // tidak direset
        // newLevel = Math.floor(newXp / 100) + 1; // Level dihitung dari total XP
        // response.status(200).json({ message: 'Quiz submitted successfully! Level Up!', ...quizResult, newLevel, newXp });
      }

      await db.execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [newXp, newLevel, userId]);
    }

    // Record user progress for this module/quiz completion
    // Check if module is completed, if it's the last quiz for a module
    // For simplicity, let's mark the module as completed if the quiz is part of it.
    // In a real app, you'd track quiz completion per module more granularly.
    await db.execute(
      'INSERT INTO user_progress (user_id, module_id, is_completed) VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE is_completed = TRUE, completed_at = CURRENT_TIMESTAMP',
      [userId, quiz.module_id]
    );

    res.status(200).json({ message: 'Quiz submitted successfully.', ...quizResult });

  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ message: 'Server error submitting quiz.' });
  }
};

const createQuiz = async (req, res) => {
  // Admin only
  const { module_id, question, options, correct_answer, xp_reward } = req.body;

  if (!module_id || !question || !options || !correct_answer || xp_reward === undefined) {
    return res.status(400).json({ message: 'All quiz fields are required.' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO quizzes (module_id, question, options, correct_answer, xp_reward) VALUES (?, ?, ?, ?, ?)',
      [module_id, question, JSON.stringify(options), correct_answer, xp_reward] // Store options as JSON string
    );
    res.status(201).json({ message: 'Quiz created successfully.', quizId: result.insertId });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({ message: 'Server error creating quiz.' });
  }
};

const updateQuiz = async (req, res) => {
  // Admin only
  const { id } = req.params;
  const { module_id, question, options, correct_answer, xp_reward } = req.body;

  if (!module_id && !question && !options && !correct_answer && xp_reward === undefined) {
    return res.status(400).json({ message: 'At least one field is required for update.' });
  }

  const fieldsToUpdate = [];
  const params = [];

  if (module_id) { fieldsToUpdate.push('module_id = ?'); params.push(module_id); }
  if (question) { fieldsToUpdate.push('question = ?'); params.push(question); }
  if (options) { fieldsToUpdate.push('options = ?'); params.push(JSON.stringify(options)); }
  if (correct_answer) { fieldsToUpdate.push('correct_answer = ?'); params.push(correct_answer); }
  if (xp_reward !== undefined) { fieldsToUpdate.push('xp_reward = ?'); params.push(xp_reward); }

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  params.push(id); // Add quiz ID for WHERE clause

  try {
    const query = `UPDATE quizzes SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
    const [result] = await db.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found or no changes made.' });
    }
    res.status(200).json({ message: 'Quiz updated successfully.' });
  } catch (error) {
    console.error('Error updating quiz:', error);
    res.status(500).json({ message: 'Server error updating quiz.' });
  }
};

const deleteQuiz = async (req, res) => {
  // Admin only
  const { id } = req.params;
  try {
    const [result] = await db.execute('DELETE FROM quizzes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found.' });
    }
    res.status(200).json({ message: 'Quiz deleted successfully.' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ message: 'Server error deleting quiz.' });
  }
};


module.exports = {
  getQuizzesByModuleId,
  submitQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
};