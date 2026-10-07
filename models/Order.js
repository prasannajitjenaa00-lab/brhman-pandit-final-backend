const mongoose = require('mongoose');
const { ORDER_STATUSES, PAYMENT_STATUSES, DEFAULT_PAYMENT_METHOD } = require('../config/constants');

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem' }],
    shipping: {
      fullName: String,
      phone: String,
      email: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
    },
    subtotal: Number,
    deliveryCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: Number,
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    couponCode: String,
    paymentMethod: { type: String, default: DEFAULT_PAYMENT_METHOD },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'COD' },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'PLACED' },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, _id: false }],
    stockDeducted: { type: Boolean, default: false },
    adminNotes: String,
    trackingNumber: String,
    // Reserved for a future payment gateway integration
    payment: { provider: String, transactionId: String, paidAmount: { type: Number, default: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
