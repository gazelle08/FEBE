// src/routers/quizRouter.js
const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { verifyToken, checkAdminRole } = require('../middleware/authMiddleware');

// Protected routes (require JWT)
// Menambahkan verifyToken karena controller sekarang memeriksa progres modul
router.get('/module/:moduleId', verifyToken, quizController.getQuizzesByModuleId);

// Protected routes (require JWT)
router.post('/submit', verifyToken, quizController.submitQuiz);

// Admin-only routes (require JWT and admin role)
router.post('/', verifyToken, checkAdminRole, quizController.createQuiz);
router.put('/:id', verifyToken, checkAdminRole, quizController.updateQuiz);
router.delete('/:id', verifyToken, checkAdminRole, quizController.deleteQuiz);

module.exports = router;