// src/routers/moduleRouter.js
const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/moduleController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/recommendations', verifyToken, moduleController.getRecommendedModules);
router.get('/', moduleController.getAllModules);
router.get('/:id', moduleController.getModuleById);


module.exports = router;