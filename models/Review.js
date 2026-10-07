const mongoose = require('mongoose');
const { REVIEW_TYPES, REVIEW_STATUSES } = require('../config/constants');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REVIEW_TYPES, required: true },
    pandit: { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit' },
    puja: { type: mongoose.Schema.Types.ObjectId, ref: 'Puja' },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
    status: { type: String, enum: REVIEW_STATUSES, default: 'APPROVED' },
  },
  { timestamps: true }
);

// Duplicate protection: one review per user per booking, and per order+product
reviewSchema.index({ user: 1, booking: 1 }, { unique: true, partialFilterExpression: { booking: { $type: 'objectId' } } });
reviewSchema.index({ user: 1, order: 1, product: 1 }, { unique: true, partialFilterExpression: { order: { $type: 'objectId' } } });

module.exports = mongoose.model('Review', reviewSchema);
