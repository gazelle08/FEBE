// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const calculateAge = (dateOfBirth) => {
  const dob = new Date(dateOfBirth);
  const diff_ms = Date.now() - dob.getTime();
  const age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
};

const register = async (req, res) => {
  const { fullName, email, password, dateOfBirth, educationLevel, gender } = req.body;

  if (!fullName || !email || !password || !dateOfBirth || !educationLevel || !gender) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const username = fullName.toLowerCase().replace(/\s/g, ''); 

  const age = calculateAge(dateOfBirth);

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Username or email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await connection.execute(
      'INSERT INTO users (username, full_name, email, password, date_of_birth, education_level, gender, age) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [username, fullName, email, hashedPassword, dateOfBirth, educationLevel, gender, age]
    );

    await connection.commit();
    res.status(201).json({ message: 'User registered successfully.', userId: result.insertId });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const [users] = await connection.execute('SELECT id, username, full_name, email, password, date_of_birth, education_level, gender FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        dateOfBirth: user.date_of_birth,
        educationLevel: user.education_level,
        gender: user.gender
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Server error during login.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  register,
  login,
};