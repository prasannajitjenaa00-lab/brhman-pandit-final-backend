const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler, ApiError, COOKIE_NAME } = require('../utils/helpers');

const loadUser = async (req) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(id);
  } catch {
    return null;
  }
};

const protect = asyncHandler(async (req, res, next) => {
  const user = await loadUser(req);
  if (!user) throw new ApiError(401, 'Please log in to continue');
  if (user.isBlocked) throw new ApiError(403, 'Your account has been blocked. Please contact support.');
  req.user = user;
  next();
});

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') return next(new ApiError(403, 'Admin access required'));
  next();
};

module.exports = { protect, adminOnly };
