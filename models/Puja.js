const mongoose = require('mongoose');
const { PUJA_CATEGORIES, DEFAULT_PUJA_CATEGORY } = require('../config/constants');

const pujaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    image: { type: String, default: '' },
    category: { type: String, enum: PUJA_CATEGORIES, default: DEFAULT_PUJA_CATEGORY, index: true },
    shortDescription: String,
    description: String,
    benefits: [String],
    duration: String,
    priceFrom: { type: Number, default: 0 },
    languages: [String],
    locations: [String],
    requiredSamagri: [String],
    recommendedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Puja', pujaSchema);
