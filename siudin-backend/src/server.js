// src/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import database connection
const db = require('./config/database');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Import Routes
const authRouter = require('./routers/authRouter');
const userRouter = require('./routers/userRouter');
const moduleRouter = require('./routers/moduleRouter');
const quizRouter = require('./routers/quizRouter');
const missionRouter = require('./routers/missionRouter');
const leaderboardRouter = require('./routers/leaderboardRouter');

// Use Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/modules', moduleRouter);
app.use('/api/quizzes', quizRouter);
app.use('/api/missions', missionRouter);
app.use('/api/leaderboard', leaderboardRouter);

// Basic route for testing
app.get('/', (req, res) => {
  res.send('SIUDIN Backend API is running!');
});

// Catch-all for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ message: 'API Endpoint not found.' });
});

// Global Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke on the server!', error: err.message });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});