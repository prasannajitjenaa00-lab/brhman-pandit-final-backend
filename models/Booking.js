const mongoose = require('mongoose');
const { BOOKING_STATUSES, PAYMENT_STATUSES } = require('../config/constants');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pandit: { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit' },
    puja: { type: mongoose.Schema.Types.ObjectId, ref: 'Puja', required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    additionalRequirements: String,
    amount: { type: Number, default: 0 },
    bookingStatus: {
      type: String,
      enum: BOOKING_STATUSES,
      default: 'PENDING',
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
    },
    // User-initiated requests, resolved by an admin
    cancellationRequested: { type: Boolean, default: false },
    cancellationReason: String,
    rescheduleRequest: {
      requested: { type: Boolean, default: false },
      date: Date,
      time: String,
      reason: String,
    },
    adminNotes: String,
    // Reserved for a future payment gateway integration
    payment: {
      provider: String,
      transactionId: String,
      paidAmount: { type: Number, default: 0 },
    },
    reviewed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
