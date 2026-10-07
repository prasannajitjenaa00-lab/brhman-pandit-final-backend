const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
    avatar: { type: String, default: '' },
    isBlocked: { type: Boolean, default: false },
    // Defaults to true so accounts created before email verification (e.g. the seeded admin) keep working;
    // registration explicitly creates users with emailVerified: false.
    emailVerified: { type: Boolean, default: true },
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpSentAt: { type: Date, select: false },
    addresses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Address' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
