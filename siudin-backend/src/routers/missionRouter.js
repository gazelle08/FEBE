// src/routers/missionRouter.js
const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const { verifyToken, checkAdminRole } = require('../middleware/authMiddleware'); // Pastikan ini juga diimpor dengan benar

// Public routes (or accessible to all logged-in users)
router.get('/', verifyToken, missionController.getAllMissions); // Get all available missions
router.get('/my-missions', verifyToken, missionController.getUserMissions); // Get user's progress on missions

// Protected routes (require JWT)
router.post('/complete', verifyToken, missionController.completeMission); // Mark a mission as completed

// Admin-only routes (require JWT and admin role)
router.post('/', verifyToken, checkAdminRole, missionController.createMission); // Ini adalah rute POST yang terpisah
router.put('/:id', verifyToken, checkAdminRole, missionController.updateMission);
router.delete('/:id', verifyToken, checkAdminRole, missionController.deleteMission);

module.exports = router;