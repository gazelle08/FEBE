// src/server.js
const express = require('express');
const cors = require('cors');
const authRouter = require('./routers/authRouter');
const userRouter = require('./routers/userRouter');
const moduleRouter = require('./routers/moduleRouter');
const quizRouter = require('./routers/quizRouter');
const leaderboardRouter = require('./routers/leaderboardRouter');
const missionRouter = require('./routers/missionRouter');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/modules', moduleRouter); 
app.use('/api/quizzes', quizRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/missions', missionRouter);

app.get('/', (req, res) => {
  res.send('Welcome to the SIUDIN API!');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});