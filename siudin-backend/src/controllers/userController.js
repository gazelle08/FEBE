// src/controllers/userController.js
const db = require('../config/database');

const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // User ID from authenticated token

    const [users] = await db.execute('SELECT id, username, email, xp, level, created_at, role FROM users WHERE id = ?', [userId]);
    const user = users[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error fetching user profile.' });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ message: 'Username and email are required for update.' });
    }

    // Optional: Add validation for unique username/email if they are being changed
    const [existingUsers] = await db.execute('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?', [username, email, userId]);
    if (existingUsers.length > 0) {
        return res.status(409).json({ message: 'Username or email already taken by another user.' });
    }

    const [result] = await db.execute(
      'UPDATE users SET username = ?, email = ? WHERE id = ?',
      [username, email, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found or no changes made.' });
    }

    res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error updating user profile.' });
  }
};

// Admin only: Get all users
const getAllUsers = async (req, res) => {
  try {
    const [users] = await db.execute('SELECT id, username, email, xp, level, created_at, role FROM users');
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching all users (admin):', error);
    res.status(500).json({ message: 'Server error fetching all users.' });
  }
};

// Admin only: Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params; // User ID to delete

    if (parseInt(id) === req.user.id && req.user.role === 'admin') {
      return res.status(403).json({ message: 'Admin cannot delete their own account via this endpoint.' });
    }

    const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user (admin):', error);
    res.status(500).json({ message: 'Server error deleting user.' });
  }
};


module.exports = {
  getUserProfile,
  updateUserProfile,
  getAllUsers, // Protected by checkAdminRole
  deleteUser,  // Protected by checkAdminRole
};