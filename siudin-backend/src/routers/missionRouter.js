// src/routers/missionRouter.js
const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, missionController.getAllMissions);
router.get('/my-missions', verifyToken, missionController.getUserMissions);
router.get('/daily', verifyToken, missionController.getDailyMissions);
router.post('/complete', verifyToken, missionController.completeMission);

module.exports = router;