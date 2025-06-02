// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Helper function to calculate age from birth date
const calculateAge = (dateOfBirth) => {
  const dob = new Date(dateOfBirth);
  const diff_ms = Date.now() - dob.getTime();
  const age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
};

const register = async (req, res) => {
  // Update fields based on the new UI
  const { fullName, email, password, dateOfBirth, educationLevel, gender } = req.body;

  // Validate required fields
  if (!fullName || !email || !password || !dateOfBirth || !educationLevel || !gender) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  // Generate a username from full name (or you can keep it as a separate input if needed)
  // Ensure it's unique, for simplicity here, we'll just use it directly.
  const username = fullName.toLowerCase().replace(/\s/g, ''); // Simple conversion for username

  // Calculate age from dateOfBirth (optional, if you still want to store age)
  const age = calculateAge(dateOfBirth);

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check if user already exists by email or derived username
    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Username or email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user into database with new fields, REMOVED 'role'
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
  // === PERUBAHAN DI SINI: Menerima 'email' dan 'password' ===
  const { email, password } = req.body; // Mengambil email dari body

  if (!email || !password) { // Validasi untuk email dan password
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    // === PERUBAHAN DI SINI: Mencari pengguna berdasarkan 'email' ===
    const [users] = await connection.execute('SELECT id, username, full_name, email, password, date_of_birth, education_level, gender FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate JWT, REMOVED 'role' from payload
    const token = jwt.sign(
      { id: user.id, username: user.username }, // Tetap sertakan username di JWT jika fitur lain masih membutuhkannya
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send back user data including new fields, excluding sensitive password
    res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username, // Tetap kembalikan username
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