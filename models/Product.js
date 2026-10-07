const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    sku: { type: String, required: true, unique: true, trim: true },
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    tagline: { type: String, trim: true }, // short line under the name on cards
    description: String,
    specifications: [{ key: String, value: String }],
    includedItems: [String],
    price: { type: Number, required: true, min: 0 }, // MRP
    discountPrice: { type: Number, min: 0 }, // selling price when discounted
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.virtual('sellingPrice').get(function () {
  return this.discountPrice && this.discountPrice < this.price ? this.discountPrice : this.price;
});
productSchema.virtual('discountPercent').get(function () {
  return this.discountPrice && this.discountPrice < this.price
    ? Math.round(((this.price - this.discountPrice) / this.price) * 100)
    : 0;
});
productSchema.virtual('stockStatus').get(function () {
  if (this.stock <= 0) return 'OUT OF STOCK';
  if (this.stock <= this.lowStockThreshold) return 'LOW STOCK';
  return 'IN STOCK';
});

module.exports = mongoose.model('Product', productSchema);
