const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET is not set in environment!');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Session expired, please login again', code: 'TOKEN_EXPIRED' });
      }
      logger.warn('JWT verify failed', { error: jwtErr.message, name: jwtErr.name });
      return res.status(401).json({ success: false, message: 'Not authorized, invalid token', code: 'INVALID_TOKEN' });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired, please login again', code: 'TOKEN_VERSION_MISMATCH' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Your account has been banned. Contact support.' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message, stack: error.stack });
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};

// Middleware for routes that require email verification
const requireVerified = (req, res, next) => {
  if (!req.user || !req.user.isEmailVerified) {
    return res.status(403).json({ success: false, message: 'Please verify your email before using this feature.' });
  }
  next();
};

module.exports = { protect, requireVerified };
