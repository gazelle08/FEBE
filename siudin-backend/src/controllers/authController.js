// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const register = async (req, res) => {
  const { username, email, password, age, gender } = req.body; // Menambahkan age dan gender

  if (!username || !email || !password || !age || !gender) { // Validasi tambahan
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    // Check if user already exists
    const [existingUsers] = await db.execute('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save user to database, including age and gender
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password, role, age, gender) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, 'user', age, gender] // Menambahkan age dan gender ke query
    );

    res.status(201).json({ message: 'User registered successfully.', userId: result.insertId });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    // Check if user exists
    const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Kirim kembali data pengguna termasuk age dan gender jika diperlukan oleh frontend
    res.status(200).json({ message: 'Login successful.', token, user: { id: user.id, username: user.username, email: user.email, role: user.role, age: user.age, gender: user.gender } });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

module.exports = {
  register,
  login,
};