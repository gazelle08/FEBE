// src/routers/userRouter.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, checkAdminRole } = require('../middleware/authMiddleware'); // Import both

// Protected routes (require JWT)
router.get('/profile', verifyToken, userController.getUserProfile);
router.put('/profile', verifyToken, userController.updateUserProfile);

// Admin-only routes (require JWT and admin role)
router.get('/', verifyToken, checkAdminRole, userController.getAllUsers);
router.delete('/:id', verifyToken, checkAdminRole, userController.deleteUser);

module.exports = router;