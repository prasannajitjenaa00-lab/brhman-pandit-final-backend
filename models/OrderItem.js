const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    image: String,
    sku: String,
    price: { type: Number, required: true }, // unit price at time of purchase
    quantity: { type: Number, required: true, min: 1 },
    subtotal: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrderItem', orderItemSchema);
