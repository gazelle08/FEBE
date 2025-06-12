// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/database');

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

  try {
    // Check for existing username or email
    let { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${username},email.eq.${email}`);

    if (checkError) throw checkError;

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        username: username,
        full_name: fullName,
        email: email,
        password: hashedPassword,
        date_of_birth: dateOfBirth,
        education_level: educationLevel,
        gender: gender,
        age: age
      })
      .select('id'); // Select the ID of the newly inserted row

    if (insertError) throw insertError;

    res.status(201).json({ message: 'User registered successfully.', userId: newUser[0].id });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // Fetch user by email
    let { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, username, full_name, email, password, date_of_birth, education_level, gender')
      .eq('email', email)
      .limit(1);

    if (fetchError) throw fetchError;

    const user = users && users.length > 0 ? users[0] : null;

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
  }
};

module.exports = {
  register,
  login,
};