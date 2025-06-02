// src/routers/missionRouter.js
const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const { verifyToken } = require('../middleware/authMiddleware'); // checkAdminRole is removed

router.get('/', verifyToken, missionController.getAllMissions);
router.get('/my-missions', verifyToken, missionController.getUserMissions);
router.post('/complete', verifyToken, missionController.completeMission);
// Admin-only routes are removed
// router.post('/', verifyToken, checkAdminRole, missionController.createMission);
// router.put('/:id', verifyToken, checkAdminRole, missionController.updateMission);
// router.delete('/:id', verifyToken, checkAdminRole, missionController.deleteMission);

module.exports = router;