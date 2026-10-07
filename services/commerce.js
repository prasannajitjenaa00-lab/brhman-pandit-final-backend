const Coupon = require('../models/Coupon');
const Product = require('../models/Product');
const Pandit = require('../models/Pandit');
const Review = require('../models/Review');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const { ApiError } = require('../utils/helpers');

const round2 = (n) => Math.round(n * 100) / 100;

// Compute discount for a coupon against a subtotal. Throws ApiError if invalid.
async function evaluateCoupon(code, subtotal) {
  const coupon = await Coupon.findOne({ code: String(code || '').toUpperCase().trim() });
  const now = new Date();
  if (!coupon || !coupon.isActive) throw new ApiError(400, 'Invalid coupon code');
  if (coupon.startDate && coupon.startDate > now) throw new ApiError(400, 'This coupon is not active yet');
  if (coupon.expiryDate && coupon.expiryDate < now) throw new ApiError(400, 'This coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new ApiError(400, 'This coupon has reached its usage limit');
  if (subtotal < coupon.minOrder) throw new ApiError(400, `Minimum order of ₹${coupon.minOrder} required for this coupon`);

  let discount = coupon.discountType === 'PERCENT' ? (subtotal * coupon.discountValue) / 100 : coupon.discountValue;
  if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  discount = round2(Math.min(discount, subtotal));
  return { coupon, discount };
}

async function deliveryChargeFor(subtotal) {
  const s = await Setting.get();
  return subtotal >= s.freeDeliveryAbove ? 0 : s.deliveryCharge;
}

// Recalculate cached rating on the target of an approved review set
async function recalcRating(review) {
  const map = {
    PANDIT: { Model: Pandit, field: 'pandit', count: 'totalReviews' },
    PRODUCT: { Model: Product, field: 'product', count: 'reviewCount' },
  };
  const cfg = map[review.targetType];
  if (!cfg || !review[cfg.field]) return;
  const [agg] = await Review.aggregate([
    { $match: { [cfg.field]: review[cfg.field], status: 'APPROVED' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  await cfg.Model.findByIdAndUpdate(review[cfg.field], {
    rating: agg ? Math.round(agg.avg * 10) / 10 : 0,
    [cfg.count]: agg ? agg.n : 0,
  });
}

const notifyAdmin = (type, title, message, link) =>
  Notification.create({ forAdmin: true, type, title, message, link }).catch(() => {});
const notifyUser = (user, type, title, message, link) =>
  Notification.create({ user, type, title, message, link }).catch(() => {});

module.exports = { evaluateCoupon, deliveryChargeFor, recalcRating, notifyAdmin, notifyUser, round2 };
