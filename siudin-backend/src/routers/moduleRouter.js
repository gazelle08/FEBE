// src/routers/moduleRouter.js
const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/moduleController');
const { verifyToken, checkAdminRole } = require('../middleware/authMiddleware');

// Public routes (can be accessed without authentication)
router.get('/', moduleController.getAllModules); // Sekarang bisa menerima filter query params
router.get('/:id', moduleController.getModuleById);

// User/Protected routes
router.get('/recommendations', verifyToken, moduleController.getRecommendedModules); // Memastikan hanya user terautentikasi yang bisa mendapat rekomendasi

// Admin-only routes (require JWT and admin role)
router.post('/', verifyToken, checkAdminRole, moduleController.createModule);
router.put('/:id', verifyToken, checkAdminRole, moduleController.updateModule);
router.delete('/:id', verifyToken, checkAdminRole, moduleController.deleteModule);

module.exports = router;