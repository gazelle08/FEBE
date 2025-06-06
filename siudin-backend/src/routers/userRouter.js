// src/routers/userRouter.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/profile', verifyToken, userController.getUserProfile);
router.put('/profile', verifyToken, userController.updateUserProfile);
router.post('/log-video-watch', verifyToken, userController.logVideoWatch);
router.get('/dashboard', verifyToken, userController.getDashboardData);
router.put('/change-password', verifyToken, userController.changePassword);

module.exports = router;