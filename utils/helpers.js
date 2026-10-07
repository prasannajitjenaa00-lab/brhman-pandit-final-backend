const jwt = require('jsonwebtoken');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COOKIE_NAME = 'bp_token';

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

const sendToken = (res, user, status = 200) => {
  res.cookie(COOKIE_NAME, signToken(user._id), cookieOptions());
  res.status(status).json({ user: publicUser(user) });
};

const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  avatar: u.avatar,
  isBlocked: u.isBlocked,
  createdAt: u.createdAt,
});

const pagination = (query, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const paged = (items, total, { page, limit }) => ({ items, total, page, pages: Math.ceil(total / limit) || 1 });

module.exports = { asyncHandler, ApiError, slugify, escapeRegex, COOKIE_NAME, cookieOptions, sendToken, publicUser, pagination, paged };
