// src/routers/quizRouter.js
const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { verifyToken } = require('../middleware/authMiddleware'); // checkAdminRole is removed

// Protected routes (require JWT)
router.get('/module/:moduleId', verifyToken, quizController.getQuizzesByModuleId);
router.post('/submit', verifyToken, quizController.submitQuiz);

// Admin-only routes are removed
// router.post('/', verifyToken, checkAdminRole, quizController.createQuiz);
// router.put('/:id', verifyToken, checkAdminRole, quizController.updateQuiz);
// router.delete('/:id', verifyToken, checkAdminRole, quizController.deleteQuiz);

module.exports = router;