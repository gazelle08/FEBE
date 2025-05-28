// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Check if token is in Authorization header (Bearer token)
  let token = req.headers.authorization;

  if (!token) {
    return res.status(403).json({ message: 'A token is required for authentication.' });
  }

  // Extract token from "Bearer <token>" string
  if (token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user information (id, username) to the request
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired.' });
    }
    return res.status(401).json({ message: 'Invalid Token.' });
  }
};

// Optional: Middleware to check if user has admin role (requires 'role' column in users table)
const checkAdminRole = async (req, res, next) => {
  // Assuming 'role' is part of the JWT payload or can be fetched from DB
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin role required.' });
  }
  next();
};

module.exports = {
  verifyToken,
  checkAdminRole
};