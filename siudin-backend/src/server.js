// src/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const db = require('./config/database');
const passport = require('passport'); 
require('./config/passport-setup'); 

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize()); 

// Import Routes
const authRouter = require('./routers/authRouter');
const userRouter = require('./routers/userRouter');
const moduleRouter = require('./routers/moduleRouter');
const quizRouter = require('./routers/quizRouter'); 
const missionRouter = require('./routers/missionRouter'); 
const leaderboardRouter = require('./routers/leaderboardRouter'); 


// Route Middleware
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/modules', moduleRouter);
app.use('/api/quizzes', quizRouter);
app.use('/api/missions', missionRouter);
app.use('/api/leaderboard', leaderboardRouter);


app.get('/', (req, res) => {
    res.send('Welcome to the Siudin Backend API!');
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});