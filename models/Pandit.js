const mongoose = require('mongoose');
const { WEEK_DAYS, DEFAULT_PANDIT_SLOTS, PANDIT_DOCUMENT_TYPES } = require('../config/constants');

const panditSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    profileImage: { type: String, default: '' },
    phone: String,
    email: String,
    bio: String,
    experience: { type: Number, default: 0 }, // years
    languages: [String],
    specializations: [String],
    location: String,
    city: String,
    state: String,
    priceFrom: { type: Number, default: 0 },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Puja' }],
    availability: {
      isAvailable: { type: Boolean, default: true },
      days: { type: [String], default: WEEK_DAYS },
      timeSlots: { type: [String], default: DEFAULT_PANDIT_SLOTS },
    },
    documents: [
      {
        type: { type: String, enum: PANDIT_DOCUMENT_TYPES, default: 'OTHER' },
        name: String,
        file: String, // filename in private_uploads (served to admins only)
      },
    ],
    rating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    completedPujas: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pandit', panditSchema);
