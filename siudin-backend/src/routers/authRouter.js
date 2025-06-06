// src/routers/authRouter.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');

router.post('/register', authController.register);
router.post('/login', authController.login);

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    (req, res) => {
        const token = req.user.token;
        res.redirect(`${process.env.FRONTEND_URL}/auth-success?token=${token}`); 
    }
);

// Facebook OAuth routes
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/login', session: false }),
    (req, res) => {
        const token = req.user.token;
        res.redirect(`${process.env.FRONTEND_URL}/auth-success?token=${token}`);
    }
);

// Apple OAuth routes
router.get('/apple', passport.authenticate('apple'));
router.post('/apple/callback',
    passport.authenticate('apple', { failureRedirect: '/login', session: false }),
    (req, res) => {
        const token = req.user.token;
        res.redirect(`${process.env.FRONTEND_URL}/auth-success?token=${token}`);
    }
);

module.exports = router;