// src/routers/moduleRouter.js
const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/moduleController');
const { verifyToken } = require('../middleware/authMiddleware'); // checkAdminRole is removed

router.get('/', moduleController.getAllModules);
router.get('/:id', moduleController.getModuleById);

router.get('/recommendations', verifyToken, moduleController.getRecommendedModules);

// Admin-only routes are removed
// router.post('/', verifyToken, checkAdminRole, moduleController.createModule);
// router.put('/:id', verifyToken, checkAdminRole, moduleController.updateModule);
// router.delete('/:id', verifyToken, checkAdminRole, moduleController.deleteModule);

module.exports = router;