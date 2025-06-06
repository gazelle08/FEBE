// src/routers/quizRouter.js
const express = require('express');
const quizController = require('../controllers/quizController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:moduleId', verifyToken, quizController.getQuizzesByModuleId);
router.post('/submit', verifyToken, quizController.submitQuiz);
module.exports = router;