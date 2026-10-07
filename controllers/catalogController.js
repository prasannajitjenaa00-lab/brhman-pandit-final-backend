// Public catalog: pujas, pandits, categories, products, reviews, settings
const Puja = require('../models/Puja');
const Pandit = require('../models/Pandit');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const Setting = require('../models/Setting');
const constants = require('../config/constants');
const { asyncHandler, ApiError, escapeRegex, pagination, paged } = require('../utils/helpers');

exports.listPujas = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.q) filter.name = new RegExp(escapeRegex(req.query.q), 'i');
  if (req.query.category) filter.category = req.query.category;
  res.json({ items: await Puja.find(filter).sort({ name: 1 }) });
});

exports.getPuja = asyncHandler(async (req, res) => {
  const puja = await Puja.findOne({ slug: req.params.slug, isActive: true }).populate({
    path: 'recommendedProducts',
    match: { isActive: true },
  });
  if (!puja) throw new ApiError(404, 'Puja not found');
  const pandits = await Pandit.find({ isActive: true, services: puja._id }).select('name profileImage rating experience city').limit(6);
  res.json({ puja, pandits });
});

exports.listPandits = asyncHandler(async (req, res) => {
  const { location, puja, language, minExperience, minRating, available, q, minPrice, maxPrice, sort } = req.query;
  const filter = { isActive: true };
  const and = [];
  const rx = (v) => new RegExp(escapeRegex(v), 'i');
  if (location) and.push({ $or: [{ city: rx(location) }, { location: rx(location) }, { state: rx(location) }] });
  if (q) and.push({ $or: [{ name: rx(q) }, { city: rx(q) }, { state: rx(q) }, { location: rx(q) }, { specializations: rx(q) }] });
  if (and.length) filter.$and = and;
  if (puja) filter.services = puja;
  if (language) filter.languages = new RegExp(`^${escapeRegex(language)}$`, 'i');
  if (minExperience) filter.experience = { $gte: Number(minExperience) };
  if (minRating) filter.rating = { $gte: Number(minRating) };
  if (available === 'true') filter['availability.isAvailable'] = true;
  if (minPrice || maxPrice) {
    filter.priceFrom = {};
    if (minPrice) filter.priceFrom.$gte = Number(minPrice);
    if (maxPrice) filter.priceFrom.$lte = Number(maxPrice);
  }

  const sorts = {
    rating: { rating: -1, totalReviews: -1 },
    experience: { experience: -1 },
    price_asc: { priceFrom: 1 },
    price_desc: { priceFrom: -1 },
  };
  const pg = pagination(req.query, 12);
  const [items, total] = await Promise.all([
    Pandit.find(filter)
      .select('-documents -phone -email')
      .populate('services', 'name slug')
      .sort(sorts[sort] || { isVerified: -1, rating: -1 })
      .skip(pg.skip)
      .limit(pg.limit),
    Pandit.countDocuments(filter),
  ]);
  res.json(paged(items, total, pg));
});

exports.getPandit = asyncHandler(async (req, res) => {
  const pandit = await Pandit.findOne({ _id: req.params.id, isActive: true }).select('-documents -phone -email').populate('services', 'name slug image priceFrom');
  if (!pandit) throw new ApiError(404, 'Pandit not found');
  const reviews = await Review.find({ pandit: pandit._id, status: 'APPROVED' }).populate('user', 'name avatar').sort({ createdAt: -1 }).limit(20);
  res.json({ pandit, reviews });
});

exports.listCategories = asyncHandler(async (req, res) => {
  const [cats, counts] = await Promise.all([
    Category.find({ isActive: true }).sort({ name: 1 }).lean(),
    Product.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ items: cats.map((c) => ({ ...c, productCount: byId.get(String(c._id)) || 0 })) });
});

// Effective selling price: the discounted price when it is lower than the MRP
const SELLING = { $cond: [{ $and: [{ $gt: ['$discountPrice', 0] }, { $lt: ['$discountPrice', '$price'] }] }, '$discountPrice', '$price'] };

exports.listProducts = asyncHandler(async (req, res) => {
  const { category, q, sort, minPrice, maxPrice, inStock, minDiscount, minRating } = req.query;
  const match = { isActive: true };

  if (category) {
    const slugs = String(category).split(',').map((s) => s.trim()).filter(Boolean);
    const cats = await Category.find({ slug: { $in: slugs } }).select('_id');
    match.category = { $in: cats.map((c) => c._id) };
  }
  if (q) match.name = new RegExp(escapeRegex(q), 'i');
  if (inStock === 'true') match.stock = { $gt: 0 };
  if (minRating) match.rating = { $gte: Number(minRating) };

  const exprs = [];
  if (minPrice) exprs.push({ $gte: [SELLING, Number(minPrice)] });
  if (maxPrice) exprs.push({ $lte: [SELLING, Number(maxPrice)] });
  if (minDiscount) {
    exprs.push({ $gte: [{ $multiply: [{ $divide: [{ $subtract: ['$price', SELLING] }, { $max: ['$price', 1] }] }, 100] }, Number(minDiscount)] });
  }
  if (exprs.length) match.$expr = { $and: exprs };

  const sorts = {
    price_asc: { _sp: 1, _id: 1 },
    price_desc: { _sp: -1, _id: 1 },
    rating: { rating: -1, reviewCount: -1, _id: 1 },
    discount: { _disc: -1, _id: 1 },
    newest: { createdAt: -1, _id: 1 },
  };
  const pg = pagination(req.query, 12);

  // Rank + paginate in the database on the effective price, then load full documents (with virtuals).
  const [result] = await Product.aggregate([
    { $match: match },
    { $addFields: { _sp: SELLING, _disc: { $divide: [{ $subtract: ['$price', SELLING] }, { $max: ['$price', 1] }] } } },
    { $sort: sorts[sort] || sorts.newest },
    { $facet: { ids: [{ $skip: pg.skip }, { $limit: pg.limit }, { $project: { _id: 1 } }], total: [{ $count: 'n' }] } },
  ]);
  const ids = result.ids.map((d) => d._id);
  const docs = await Product.find({ _id: { $in: ids } }).populate('category', 'name slug');
  const order = new Map(ids.map((id, i) => [String(id), i]));
  docs.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  res.json(paged(docs, result.total[0]?.n || 0, pg));
});

exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true }).populate('category', 'name slug');
  if (!product) throw new ApiError(404, 'Product not found');
  const [reviews, related] = await Promise.all([
    Review.find({ product: product._id, status: 'APPROVED' }).populate('user', 'name avatar').sort({ createdAt: -1 }).limit(20),
    Product.find({ isActive: true, category: product.category._id, _id: { $ne: product._id } }).limit(4),
  ]);
  res.json({ product, reviews, related });
});

// Products by ids (used by cart to refresh prices/stock)
exports.productsByIds = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 50);
  res.json({ items: await Product.find({ _id: { $in: ids }, isActive: true }) });
});

exports.publicSettings = asyncHandler(async (req, res) => {
  const s = await Setting.get();
  res.json({
    siteName: s.siteName,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    address: s.address,
    workingHours: s.workingHours,
    facebook: s.facebook,
    instagram: s.instagram,
    youtube: s.youtube,
    whatsapp: s.whatsapp,
    deliveryCharge: s.deliveryCharge,
    freeDeliveryAbove: s.freeDeliveryAbove,
  });
});

// Domain enums/defaults used by the UI (statuses, slots, categories) - one source of truth: config/constants.js
exports.meta = (req, res) => {
  res.json({
    bookingStatuses: constants.BOOKING_STATUSES,
    paymentStatuses: constants.PAYMENT_STATUSES,
    orderStatuses: constants.ORDER_STATUSES,
    pujaCategories: constants.PUJA_CATEGORIES,
    reviewTypes: constants.REVIEW_TYPES,
    reviewStatuses: constants.REVIEW_STATUSES,
    pandit: { weekDays: constants.WEEK_DAYS, defaultTimeSlots: constants.DEFAULT_PANDIT_SLOTS, documentTypes: constants.PANDIT_DOCUMENT_TYPES },
    timeSlots: constants.TIME_SLOTS,
    contactSubjects: constants.CONTACT_SUBJECTS,
    paymentMethods: constants.PAYMENT_METHODS,
  });
};

const roundUp = (n, step) => Math.max(step, Math.ceil(n / step) * step);

// Filter option values derived from live data (languages, price bounds)
exports.panditFilters = asyncHandler(async (req, res) => {
  const [languages, [bounds]] = await Promise.all([
    Pandit.distinct('languages', { isActive: true }),
    Pandit.aggregate([{ $match: { isActive: true } }, { $group: { _id: null, min: { $min: '$priceFrom' }, max: { $max: '$priceFrom' } } }]),
  ]);
  res.json({ languages: languages.sort(), minPrice: 0, maxPrice: roundUp(bounds?.max || 0, 500) });
});

exports.productFilters = asyncHandler(async (req, res) => {
  const [bounds] = await Product.aggregate([{ $match: { isActive: true } }, { $group: { _id: null, max: { $max: '$price' } } }]);
  res.json({ minPrice: 0, maxPrice: roundUp(bounds?.max || 0, 500) });
});
