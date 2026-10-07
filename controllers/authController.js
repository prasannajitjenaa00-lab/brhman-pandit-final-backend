const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { asyncHandler, ApiError, sendToken, publicUser, COOKIE_NAME, cookieOptions } = require('../utils/helpers');
const email = require('../services/emailService');
const { notifyAdmin } = require('../services/commerce');
const logger = require('../utils/logger');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const checkPassword = (pw) => {
  if (typeof pw !== 'string' || pw.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (pw.length > 72) throw new ApiError(400, 'Password is too long');
};

const OTP_TTL_MIN = 10;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const isProd = process.env.NODE_ENV === 'production';

// Codes are stored only as an HMAC (bound to the email) so a database leak does not reveal live codes.
const hashOtp = (mail, otp) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${mail}:${otp}`).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Generates and emails a fresh 6-digit code (60s cooldown between sends).
async function issueOtp(user) {
  const last = user.otpSentAt ? Date.now() - user.otpSentAt.getTime() : Infinity;
  if (last < OTP_COOLDOWN_MS) throw new ApiError(429, `Please wait ${Math.ceil((OTP_COOLDOWN_MS - last) / 1000)}s before requesting another code`);
  const otp = String(crypto.randomInt(100000, 1000000));
  user.otpHash = hashOtp(user.email, otp);
  user.otpExpires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
  user.otpAttempts = 0;
  user.otpSentAt = new Date();
  await user.save();
  email.sendOtpEmail(user, otp, OTP_TTL_MIN);
  // Local development without SMTP: print the code so sign-up can still be tested. Never in production.
  if (!isProd && !email.isConfigured()) logger.warn(`[dev] verification code for ${user.email}: ${otp}`);
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email: mail, phone, password } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Name is required');
  if (!EMAIL_RE.test(mail || '')) throw new ApiError(400, 'A valid email is required');
  checkPassword(password);

  const address = mail.toLowerCase().trim();
  let user = await User.findOne({ email: address }).select('+otpSentAt');
  if (user?.emailVerified) throw new ApiError(409, 'An account with this email already exists');

  // An unverified signup can be retried: details are replaced and a new code is sent.
  const hashed = await bcrypt.hash(password, 12);
  if (user) Object.assign(user, { name, phone, password: hashed });
  else user = new User({ name, email: address, phone, password: hashed, role: 'USER', emailVerified: false }); // role is never taken from the request
  await issueOtp(user);
  res.status(201).json({ needsVerification: true, email: user.email, message: `We sent a 6-digit code to ${user.email}` });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const address = String(req.body.email || '').toLowerCase().trim();
  const code = String(req.body.otp || '').trim();
  if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'Enter the 6-digit code');

  const user = await User.findOne({ email: address }).select('+otpHash +otpExpires +otpAttempts');
  if (!user || !user.otpHash) throw new ApiError(400, 'No pending verification for this email. Please register or request a new code.');
  if (user.isBlocked) throw new ApiError(403, 'Your account has been blocked. Please contact support.');
  if (user.otpExpires < new Date()) throw new ApiError(400, 'This code has expired. Request a new one.');
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) throw new ApiError(429, 'Too many incorrect attempts. Request a new code.');

  if (!safeEqual(hashOtp(user.email, code), user.otpHash)) {
    user.otpAttempts += 1;
    await user.save();
    const left = OTP_MAX_ATTEMPTS - user.otpAttempts;
    throw new ApiError(400, left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new code.');
  }

  const firstVerification = !user.emailVerified;
  user.emailVerified = true;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  await user.save();

  if (firstVerification) {
    email.sendWelcomeEmail(user);
    email.sendAdminNewUserEmail(user);
    notifyAdmin('NEW_USER', 'New user registered', `${user.name} (${user.email})`, '/admin/users');
  }
  sendToken(res, user);
});

exports.resendOtp = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase().trim() }).select('+otpSentAt');
  if (user && !user.emailVerified && !user.isBlocked) await issueOtp(user);
  // Same response either way so emails can't be enumerated
  res.json({ message: 'If a verification is pending for that email, a new code has been sent.' });
});

exports.login = asyncHandler(async (req, res) => {
  const { email: mail, password } = req.body;
  const user = await User.findOne({ email: String(mail || '').toLowerCase() }).select('+password +otpSentAt');
  if (!user || !(await bcrypt.compare(String(password || ''), user.password))) throw new ApiError(401, 'Invalid email or password');
  if (user.isBlocked) throw new ApiError(403, 'Your account has been blocked. Please contact support.');
  if (!user.emailVerified) {
    await issueOtp(user).catch(() => {}); // cooldown just means a recent code is still valid
    return res.status(403).json({ message: 'Please verify your email to continue. We sent you a code.', needsVerification: true, email: user.email });
  }
  sendToken(res, user);
});

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ message: 'Logged out' });
};

exports.me = (req, res) => res.json({ user: publicUser(req.user) });

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'Name is required');
    req.user.name = name;
  }
  if (phone !== undefined) req.user.phone = phone;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  checkPassword(newPassword);
  const user = await User.findById(req.user._id).select('+password');
  if (!(await bcrypt.compare(String(currentPassword || ''), user.password))) throw new ApiError(400, 'Current password is incorrect');
  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ message: 'Password updated' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (user && !user.isBlocked) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000;
    await user.save();
    email.sendPasswordResetEmail(user, token);
  }
  // Same response either way so emails can't be enumerated
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  checkPassword(req.body.password);
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpires: { $gt: Date.now() } }).select(
    '+resetPasswordToken +resetPasswordExpires'
  );
  if (!user) throw new ApiError(400, 'This reset link is invalid or has expired');
  user.password = await bcrypt.hash(req.body.password, 12);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: 'Password reset successful. You can now log in.' });
});
