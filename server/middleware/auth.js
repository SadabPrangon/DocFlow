const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const crypto = require('crypto');
const hashValue = (value) => crypto.createHmac('sha256', process.env.OTP_SECRET || process.env.JWT_SECRET).update(String(value)).digest('hex');

const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Please log in first.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password +tokenVersion');
    if (!user || !user.isActive || !decoded.jti || Number(decoded.version || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Account is unavailable.' });
    }
    const session = await AuthSession.findOne({ user: user._id, jtiHash: hashValue(decoded.jti), revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ success: false, message: 'Login session has ended.' });
    session.lastUsedAt = new Date(); await session.save();
    req.user = user;
    req.authSession = session;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired login session.' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission for this action.' });
  }
  next();
};

module.exports = { protect, authorize };
