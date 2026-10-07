const mongoose = require('mongoose');
const { CONTACT_STATUSES } = require('../config/constants');

module.exports = mongoose.model(
  'ContactMessage',
  new mongoose.Schema(
    {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: String,
      subject: { type: String, required: true },
      message: { type: String, required: true },
      status: { type: String, enum: CONTACT_STATUSES, default: 'NEW' },
    },
    { timestamps: true }
  )
);
