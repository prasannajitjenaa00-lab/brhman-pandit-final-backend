const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Pandit = require('../models/Pandit');
const Puja = require('../models/Puja');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const ContactMessage = require('../models/ContactMessage');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const { BOOKING_STATUSES, ACTIVE_BOOKING_STATUSES, CLOSED_BOOKING_STATUSES, PAYMENT_STATUSES, ORDER_STATUSES, OPEN_ORDER_STATUSES, CLOSED_ORDER_STATUSES, REVIEW_STATUSES, CONTACT_STATUSES } = require('../config/constants');
const { asyncHandler, ApiError, slugify, escapeRegex, pagination, paged } = require('../utils/helpers');
const { saveImage, savePrivateDocument, PRIVATE_DIR } = require('../middleware/upload');
const email = require('../services/emailService');
const { recalcRating, notifyUser } = require('../services/commerce');

const pick = (obj, keys) => keys.reduce((o, k) => (obj[k] !== undefined ? { ...o, [k]: obj[k] } : o), {});
// multipart requests carry their JSON payload in a "data" field
const body = (req) => {
  if (typeof req.body.data === 'string') {
    try {
      return JSON.parse(req.body.data);
    } catch {
      throw new ApiError(400, 'Invalid form data');
    }
  }
  return req.body;
};
const oid = (v) => (mongoose.isValidObjectId(v) ? v : undefined);
const dayRange = (from, to) => {
  const r = {};
  if (from) r.$gte = new Date(from);
  if (to) r.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return Object.keys(r).length ? r : undefined;
};

// ================= Dashboard & reports =================
exports.stats = asyncHandler(async (req, res) => {
  const days = Math.min(730, Math.max(7, parseInt(req.query.days, 10) || 30));
  const since = new Date(Date.now() - days * 86400000);
  const fmt = days <= 31 ? '%Y-%m-%d' : '%Y-%m';
  const trend = (Model, field, extra = {}) =>
    Model.aggregate([
      { $match: { createdAt: { $gte: since }, ...extra } },
      { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, count: { $sum: 1 }, amount: { $sum: field ? `$${field}` : 0 } } },
      { $sort: { _id: 1 } },
    ]);

  const [
    totalUsers, totalPandits, totalBookings, pendingBookings, completedBookings, totalOrders, pendingOrders, totalProducts, lowStock,
    orderRevenue, bookingRevenue, bookingTrend, orderTrend, orderRevTrend, bookingRevTrend, popularPujas, popularProducts,
  ] = await Promise.all([
    User.countDocuments({ role: 'USER' }),
    Pandit.countDocuments({ isActive: true }),
    Booking.countDocuments(),
    Booking.countDocuments({ bookingStatus: 'PENDING' }),
    Booking.countDocuments({ bookingStatus: 'COMPLETED' }),
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: { $in: OPEN_ORDER_STATUSES } }),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
    Order.aggregate([{ $match: { orderStatus: 'DELIVERED' } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
    Booking.aggregate([{ $match: { bookingStatus: 'COMPLETED' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
    trend(Booking),
    trend(Order),
    trend(Order, 'total', { orderStatus: 'DELIVERED' }),
    trend(Booking, 'amount', { bookingStatus: 'COMPLETED' }),
    Booking.aggregate([
      { $match: { bookingStatus: { $ne: 'CANCELLED' } } },
      { $group: { _id: '$puja', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'pujas', localField: '_id', foreignField: '_id', as: 'p' } },
      { $project: { name: { $arrayElemAt: ['$p.name', 0] }, count: 1 } },
    ]),
    OrderItem.aggregate([
      { $group: { _id: '$product', name: { $first: '$name' }, count: { $sum: '$quantity' } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);

  // merge order + booking revenue by period
  const revMap = new Map();
  [...orderRevTrend, ...bookingRevTrend].forEach((r) => revMap.set(r._id, (revMap.get(r._id) || 0) + r.amount));
  const revenueTrend = [...revMap.entries()].sort().map(([date, amount]) => ({ date, amount }));

  res.json({
    cards: {
      totalUsers, totalPandits, totalBookings, pendingBookings, completedBookings, totalOrders, pendingOrders, totalProducts,
      lowStockProducts: lowStock,
      totalRevenue: (orderRevenue[0]?.t || 0) + (bookingRevenue[0]?.t || 0),
    },
    bookingTrend: bookingTrend.map((r) => ({ date: r._id, count: r.count })),
    orderTrend: orderTrend.map((r) => ({ date: r._id, count: r.count })),
    revenueTrend,
    popularPujas: popularPujas.map((p) => ({ name: p.name || 'Unknown', count: p.count })),
    popularProducts: popularProducts.map((p) => ({ name: p.name, count: p.count })),
  });
});

exports.notifications = asyncHandler(async (req, res) => {
  const items = await Notification.find({ forAdmin: true }).sort({ createdAt: -1 }).limit(30);
  res.json({ items, unread: items.filter((n) => !n.isRead).length });
});
exports.markNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ forAdmin: true, isRead: false }, { isRead: true });
  res.json({ message: 'ok' });
});

// ================= Users =================
exports.listUsers = asyncHandler(async (req, res) => {
  const { q, status, role } = req.query;
  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (status === 'blocked') filter.isBlocked = true;
  if (status === 'active') filter.isBlocked = false;
  if (role) filter.role = role;
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit), User.countDocuments(filter)]);
  res.json(paged(items, total, pg));
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('addresses');
  if (!user) throw new ApiError(404, 'User not found');
  const [bookings, orders] = await Promise.all([
    Booking.find({ user: user._id }).populate('puja', 'name').sort({ createdAt: -1 }).limit(50),
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(50),
  ]);
  res.json({ user, bookings, orders });
});

exports.setBlocked = (blocked) =>
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, 'User not found');
    if (user.role === 'ADMIN') throw new ApiError(400, 'Admin accounts cannot be blocked');
    user.isBlocked = blocked;
    await user.save();
    res.json({ user });
  });

// ================= Pandits =================
const PANDIT_FIELDS = ['name', 'phone', 'email', 'bio', 'experience', 'languages', 'specializations', 'location', 'city', 'state', 'priceFrom', 'services', 'availability', 'isVerified', 'isActive'];

async function applyPanditFiles(pandit, req, data) {
  const files = req.files || {};
  if (files.profileImage?.[0]) pandit.profileImage = await saveImage(files.profileImage[0], 'brahmam-pandit/pandits');
  if (Array.isArray(data.removeDocuments)) {
    for (const id of data.removeDocuments) {
      const doc = pandit.documents.id(id);
      if (doc) {
        fs.promises.unlink(path.join(PRIVATE_DIR, path.basename(doc.file))).catch(() => {});
        doc.deleteOne();
      }
    }
  }
  const meta = data.documentMeta || [];
  for (const [i, file] of (files.documents || []).entries()) {
    pandit.documents.push({ type: meta[i]?.type || 'OTHER', name: meta[i]?.name || file.originalname, file: await savePrivateDocument(file) });
  }
}

exports.listPandits = asyncHandler(async (req, res) => {
  const { q, status } = req.query;
  const filter = {};
  if (q) filter.name = new RegExp(escapeRegex(q), 'i');
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (status === 'unverified') filter.isVerified = false;
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([Pandit.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit), Pandit.countDocuments(filter)]);
  res.json(paged(items, total, pg));
});

exports.getPandit = asyncHandler(async (req, res) => {
  const pandit = await Pandit.findById(req.params.id).populate('services', 'name');
  if (!pandit) throw new ApiError(404, 'Pandit not found');
  res.json({ pandit });
});

exports.createPandit = asyncHandler(async (req, res) => {
  const data = body(req);
  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');
  const pandit = new Pandit(pick(data, PANDIT_FIELDS));
  await applyPanditFiles(pandit, req, data);
  await pandit.save();
  res.status(201).json({ pandit });
});

exports.updatePandit = asyncHandler(async (req, res) => {
  const data = body(req);
  const pandit = await Pandit.findById(req.params.id);
  if (!pandit) throw new ApiError(404, 'Pandit not found');
  pandit.set(pick(data, PANDIT_FIELDS));
  await applyPanditFiles(pandit, req, data);
  await pandit.save();
  res.json({ pandit });
});

exports.deactivatePandit = asyncHandler(async (req, res) => {
  const pandit = await Pandit.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!pandit) throw new ApiError(404, 'Pandit not found');
  res.json({ pandit, message: 'Pandit deactivated' });
});

exports.downloadPanditDocument = asyncHandler(async (req, res) => {
  const pandit = await Pandit.findById(req.params.id);
  const doc = pandit?.documents.id(req.params.docId);
  if (!doc) throw new ApiError(404, 'Document not found');
  const file = path.join(PRIVATE_DIR, path.basename(doc.file));
  if (!fs.existsSync(file)) throw new ApiError(404, 'File missing');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file);
});

// ================= Pujas =================
const PUJA_FIELDS = ['name', 'category', 'shortDescription', 'description', 'benefits', 'duration', 'priceFrom', 'languages', 'locations', 'requiredSamagri', 'recommendedProducts', 'isActive'];

const uniqueSlug = async (Model, base, excludeId) => {
  let slug = slugify(base) || 'item';
  let n = 1;
  while (await Model.exists({ slug, _id: { $ne: excludeId } })) slug = `${slugify(base)}-${++n}`;
  return slug;
};

exports.listPujas = asyncHandler(async (req, res) => {
  const filter = req.query.q ? { name: new RegExp(escapeRegex(req.query.q), 'i') } : {};
  res.json({ items: await Puja.find(filter).sort({ createdAt: -1 }) });
});
exports.getPuja = asyncHandler(async (req, res) => {
  const puja = await Puja.findById(req.params.id).populate('recommendedProducts', 'name sku');
  if (!puja) throw new ApiError(404, 'Puja not found');
  res.json({ puja });
});
exports.createPuja = asyncHandler(async (req, res) => {
  const data = body(req);
  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');
  const puja = new Puja({ ...pick(data, PUJA_FIELDS), slug: await uniqueSlug(Puja, data.name) });
  if (req.file) puja.image = await saveImage(req.file, 'brahmam-pandit/pujas');
  await puja.save();
  res.status(201).json({ puja });
});
exports.updatePuja = asyncHandler(async (req, res) => {
  const data = body(req);
  const puja = await Puja.findById(req.params.id);
  if (!puja) throw new ApiError(404, 'Puja not found');
  puja.set(pick(data, PUJA_FIELDS));
  if (req.file) puja.image = await saveImage(req.file, 'brahmam-pandit/pujas');
  await puja.save();
  res.json({ puja });
});
exports.deactivatePuja = asyncHandler(async (req, res) => {
  const puja = await Puja.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!puja) throw new ApiError(404, 'Puja not found');
  res.json({ puja });
});

// ================= Categories =================
exports.listCategories = asyncHandler(async (req, res) => res.json({ items: await Category.find().sort({ name: 1 }) }));
exports.createCategory = asyncHandler(async (req, res) => {
  const data = body(req);
  if (!data.name?.trim()) throw new ApiError(400, 'Name is required');
  const cat = new Category({ ...pick(data, ['name', 'description', 'isActive']), slug: await uniqueSlug(Category, data.name) });
  if (req.file) cat.image = await saveImage(req.file, 'brahmam-pandit/categories');
  await cat.save();
  res.status(201).json({ category: cat });
});
exports.updateCategory = asyncHandler(async (req, res) => {
  const data = body(req);
  const cat = await Category.findById(req.params.id);
  if (!cat) throw new ApiError(404, 'Category not found');
  cat.set(pick(data, ['name', 'description', 'isActive']));
  if (req.file) cat.image = await saveImage(req.file, 'brahmam-pandit/categories');
  await cat.save();
  res.json({ category: cat });
});
exports.deleteCategory = asyncHandler(async (req, res) => {
  if (await Product.exists({ category: req.params.id })) throw new ApiError(400, 'Category has products. Deactivate it instead.');
  await Category.findByIdAndDelete(req.params.id);
  res.json({ message: 'Category deleted' });
});

// ================= Products & inventory =================
const PRODUCT_FIELDS = ['name', 'tagline', 'sku', 'category', 'description', 'specifications', 'includedItems', 'price', 'discountPrice', 'stock', 'lowStockThreshold', 'isActive'];

exports.listProducts = asyncHandler(async (req, res) => {
  const { q, category, status } = req.query;
  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }
  if (oid(category)) filter.category = category;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([
    Product.find(filter).populate('category', 'name').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Product.countDocuments(filter),
  ]);
  res.json(paged(items, total, pg));
});
exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ product });
});

async function applyProductImages(product, req, data) {
  if (Array.isArray(data.existingImages)) product.images = product.images.filter((i) => data.existingImages.includes(i));
  for (const file of req.files || []) product.images.push(await saveImage(file, 'brahmam-pandit/products'));
}
const checkPrices = (p) => {
  if (p.discountPrice != null && p.discountPrice !== '' && Number(p.discountPrice) > Number(p.price)) throw new ApiError(400, 'Discount price cannot exceed the price');
};

exports.createProduct = asyncHandler(async (req, res) => {
  const data = body(req);
  checkPrices(data);
  if (data.discountPrice === '' || data.discountPrice === null) delete data.discountPrice;
  const product = new Product({ ...pick(data, PRODUCT_FIELDS), slug: await uniqueSlug(Product, data.name || '') });
  await applyProductImages(product, req, { existingImages: [] });
  await product.save();
  res.status(201).json({ product });
});
exports.updateProduct = asyncHandler(async (req, res) => {
  const data = body(req);
  checkPrices(data);
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  product.set(pick(data, PRODUCT_FIELDS));
  if (data.discountPrice === '' || data.discountPrice === null) product.discountPrice = undefined;
  await applyProductImages(product, req, data);
  await product.save();
  res.json({ product });
});
exports.deactivateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ product });
});

exports.inventory = asyncHandler(async (req, res) => {
  const { q, status } = req.query;
  const filter = { isActive: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }
  if (status === 'OUT') filter.stock = { $lte: 0 };
  if (status === 'LOW') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] };
  if (status === 'IN') filter.$expr = { $gt: ['$stock', '$lowStockThreshold'] };
  const pg = pagination(req.query, 30);
  const [items, total] = await Promise.all([Product.find(filter).sort({ stock: 1 }).skip(pg.skip).limit(pg.limit), Product.countDocuments(filter)]);
  res.json(paged(items, total, pg));
});
exports.updateStock = asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.stock !== undefined) {
    const stock = Number(req.body.stock);
    if (!Number.isInteger(stock) || stock < 0) throw new ApiError(400, 'Stock must be a non-negative whole number');
    update.stock = stock;
  }
  if (req.body.lowStockThreshold !== undefined) {
    const t = Number(req.body.lowStockThreshold);
    if (!Number.isInteger(t) || t < 0) throw new ApiError(400, 'Threshold must be a non-negative whole number');
    update.lowStockThreshold = t;
  }
  const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ product });
});

// ================= Bookings =================
exports.listBookings = asyncHandler(async (req, res) => {
  const { status, puja, pandit, city, from, to, q, paymentStatus, requests } = req.query;
  const filter = {};
  if (status) filter.bookingStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (oid(puja)) filter.puja = puja;
  if (oid(pandit)) filter.pandit = pandit;
  if (city) filter.city = new RegExp(escapeRegex(city), 'i');
  const range = dayRange(from, to);
  if (range) filter.date = range;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ bookingId: rx }, { customerName: rx }, { phone: rx }, { email: rx }];
  }
  if (requests === 'true') filter.$or = [{ cancellationRequested: true }, { 'rescheduleRequest.requested': true }];
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([
    Booking.find(filter).populate('puja', 'name').populate('pandit', 'name').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Booking.countDocuments(filter),
  ]);
  res.json(paged(items, total, pg));
});

exports.getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('puja', 'name slug image').populate('pandit', 'name phone city profileImage').populate('user', 'name email phone');
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.json({ booking });
});

exports.updateBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const b = req.body;
  const prevStatus = booking.bookingStatus;
  const prevSlot = `${booking.date?.toISOString()}|${booking.time}`;
  const prevPandit = String(booking.pandit || '');
  let nextStatus = b.bookingStatus || prevStatus;

  if (b.bookingStatus && !BOOKING_STATUSES.includes(b.bookingStatus)) throw new ApiError(400, 'Invalid booking status');
  if (b.paymentStatus) {
    if (!PAYMENT_STATUSES.includes(b.paymentStatus)) throw new ApiError(400, 'Invalid payment status');
    booking.paymentStatus = b.paymentStatus;
  }
  if (b.pandit !== undefined) {
    if (b.pandit) {
      if (!(await Pandit.exists({ _id: b.pandit, isActive: true }))) throw new ApiError(400, 'Pandit not found or inactive');
      booking.pandit = b.pandit;
    } else booking.pandit = undefined;
  }
  if (b.date) {
    const d = new Date(b.date);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid date');
    booking.date = d;
  }
  if (b.time) booking.time = b.time;
  if (b.adminNotes !== undefined) booking.adminNotes = b.adminNotes;
  if (b.amount !== undefined) booking.amount = Math.max(0, Number(b.amount) || 0);

  const slotChanged = `${booking.date?.toISOString()}|${booking.time}` !== prevSlot;
  if (CLOSED_BOOKING_STATUSES.includes(prevStatus) && nextStatus !== prevStatus) throw new ApiError(400, `A ${prevStatus.toLowerCase()} booking cannot be changed to ${nextStatus.toLowerCase()}`);
  if (slotChanged && !b.bookingStatus && ACTIVE_BOOKING_STATUSES.includes(prevStatus)) nextStatus = prevStatus === 'PENDING' ? 'PENDING' : 'RESCHEDULED';
  if (slotChanged && b.bookingStatus === 'RESCHEDULED') nextStatus = 'RESCHEDULED';
  if (nextStatus === 'RESCHEDULED' && !slotChanged && prevStatus !== 'RESCHEDULED') throw new ApiError(400, 'Choose a new date or time to reschedule');

  if (['CONFIRMED', 'RESCHEDULED'].includes(nextStatus) && !booking.pandit) throw new ApiError(400, 'Assign a Pandit before confirming this booking');
  if (booking.pandit && (slotChanged || String(booking.pandit) !== prevPandit) && ACTIVE_BOOKING_STATUSES.includes(nextStatus)) {
    const clash = await Booking.findOne({
      _id: { $ne: booking._id },
      pandit: booking.pandit,
      date: booking.date,
      time: booking.time,
      bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    });
    if (clash) throw new ApiError(409, `This Pandit already has booking ${clash.bookingId} at that slot`);
  }

  booking.bookingStatus = nextStatus;
  if (nextStatus === 'CANCELLED') booking.cancellationRequested = false;
  if (slotChanged) booking.rescheduleRequest = { requested: false };
  if (b.dismissRequests) {
    booking.cancellationRequested = false;
    booking.rescheduleRequest = { requested: false };
  }
  await booking.save();
  if (nextStatus === 'COMPLETED' && prevStatus !== 'COMPLETED' && booking.pandit) await Pandit.findByIdAndUpdate(booking.pandit, { $inc: { completedPujas: 1 } });

  await booking.populate(['puja', 'pandit']);
  if (nextStatus !== prevStatus || slotChanged) {
    const link = `/dashboard/bookings/${booking._id}`;
    if (nextStatus === 'CONFIRMED' && prevStatus !== 'CONFIRMED') {
      email.sendBookingConfirmedEmail(booking);
      notifyUser(booking.user, 'BOOKING', 'Booking confirmed', booking.bookingId, link);
    } else if (nextStatus === 'CANCELLED') {
      email.sendBookingCancelledEmail(booking);
      notifyUser(booking.user, 'BOOKING', 'Booking cancelled', booking.bookingId, link);
    } else if (nextStatus === 'RESCHEDULED' || (slotChanged && nextStatus !== 'COMPLETED')) {
      email.sendBookingRescheduledEmail(booking);
      notifyUser(booking.user, 'BOOKING', 'Booking rescheduled', booking.bookingId, link);
    } else if (nextStatus === 'COMPLETED') {
      notifyUser(booking.user, 'BOOKING', 'Puja completed — share your review', booking.bookingId, link);
    }
  }
  res.json({ booking });
});

// ================= Orders =================
exports.listOrders = asyncHandler(async (req, res) => {
  const { status, q, from, to, paymentStatus } = req.query;
  const filter = {};
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  const range = dayRange(from, to);
  if (range) filter.createdAt = range;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ orderId: rx }, { 'shipping.fullName': rx }, { 'shipping.phone': rx }, { 'shipping.email': rx }];
  }
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([Order.find(filter).populate('items').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit), Order.countDocuments(filter)]);
  res.json(paged(items, total, pg));
});

exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items').populate('user', 'name email phone');
  if (!order) throw new ApiError(404, 'Order not found');
  res.json({ order });
});

// Atomically deduct stock for all items; rolls back if any line lacks stock.
async function deductStock(order) {
  const done = [];
  for (const item of order.items) {
    const r = await Product.updateOne({ _id: item.product, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } });
    if (r.modifiedCount !== 1) {
      for (const d of done) await Product.updateOne({ _id: d.product }, { $inc: { stock: d.quantity } });
      throw new ApiError(400, `Insufficient stock for "${item.name}". Update inventory before confirming.`);
    }
    done.push(item);
  }
}
const restoreStock = async (order) => {
  for (const item of order.items) await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
};

exports.updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items');
  if (!order) throw new ApiError(404, 'Order not found');
  const { orderStatus, paymentStatus, trackingNumber, adminNotes } = req.body;
  const prev = order.orderStatus;

  if (paymentStatus) {
    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new ApiError(400, 'Invalid payment status');
    order.paymentStatus = paymentStatus;
  }
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
  if (adminNotes !== undefined) order.adminNotes = adminNotes;

  if (orderStatus && orderStatus !== prev) {
    if (!ORDER_STATUSES.includes(orderStatus)) throw new ApiError(400, 'Invalid order status');
    if (CLOSED_ORDER_STATUSES.includes(prev)) throw new ApiError(400, `A ${prev.toLowerCase()} order cannot be changed`);
    if (orderStatus !== 'CANCELLED' && ORDER_STATUSES.indexOf(orderStatus) < ORDER_STATUSES.indexOf(prev)) throw new ApiError(400, 'Order status cannot move backwards');

    if (orderStatus === 'CANCELLED') {
      if (order.stockDeducted) {
        await restoreStock(order);
        order.stockDeducted = false;
      }
      if (order.coupon) await Coupon.updateOne({ _id: order.coupon, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    } else if (!order.stockDeducted) {
      // stock is reserved the first time the order is confirmed (or moves past PLACED)
      await deductStock(order);
      order.stockDeducted = true;
    }
    if (orderStatus === 'DELIVERED' && order.paymentStatus === 'COD') order.paymentStatus = 'PAID';
    order.orderStatus = orderStatus;
    order.statusHistory.push({ status: orderStatus });
  }
  await order.save();

  if (orderStatus && orderStatus !== prev) {
    const link = `/dashboard/orders/${order._id}`;
    if (orderStatus === 'CONFIRMED') email.sendOrderConfirmedEmail(order);
    if (orderStatus === 'SHIPPED') email.sendOrderShippedEmail(order);
    if (orderStatus === 'DELIVERED') email.sendOrderDeliveredEmail(order);
    notifyUser(order.user, 'ORDER', `Order ${orderStatus.replace(/_/g, ' ').toLowerCase()}`, order.orderId, link);
  }
  res.json({ order });
});

// ================= Reviews =================
exports.listReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.targetType = req.query.type;
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([
    Review.find(filter).populate('user', 'name email').populate('pandit', 'name').populate('puja', 'name').populate('product', 'name').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Review.countDocuments(filter),
  ]);
  res.json(paged(items, total, pg));
});
exports.setReviewStatus = asyncHandler(async (req, res) => {
  if (!REVIEW_STATUSES.includes(req.body.status)) throw new ApiError(400, 'Invalid status');
  const review = await Review.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!review) throw new ApiError(404, 'Review not found');
  await recalcRating(review);
  res.json({ review });
});
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  await recalcRating(review);
  res.json({ message: 'Review deleted' });
});

// ================= Coupons =================
const COUPON_FIELDS = ['code', 'description', 'discountType', 'discountValue', 'minOrder', 'maxDiscount', 'startDate', 'expiryDate', 'usageLimit', 'isActive'];
const cleanCoupon = (d) => {
  const c = pick(d, COUPON_FIELDS);
  if (c.startDate === '') c.startDate = undefined;
  if (c.expiryDate === '') c.expiryDate = undefined;
  if (c.discountType === 'PERCENT' && Number(c.discountValue) > 100) throw new ApiError(400, 'Percentage cannot exceed 100');
  return c;
};
exports.listCoupons = asyncHandler(async (req, res) => res.json({ items: await Coupon.find().sort({ createdAt: -1 }) }));
exports.createCoupon = asyncHandler(async (req, res) => res.status(201).json({ coupon: await Coupon.create(cleanCoupon(req.body)) }));
exports.updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw new ApiError(404, 'Coupon not found');
  coupon.set(cleanCoupon(req.body));
  await coupon.save();
  res.json({ coupon });
});
exports.deleteCoupon = asyncHandler(async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ message: 'Coupon deleted' });
});

// ================= Contact messages & settings =================
exports.listMessages = asyncHandler(async (req, res) => {
  const pg = pagination(req.query);
  const [items, total] = await Promise.all([ContactMessage.find().sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit), ContactMessage.countDocuments()]);
  res.json(paged(items, total, pg));
});
exports.updateMessage = asyncHandler(async (req, res) => {
  if (!CONTACT_STATUSES.includes(req.body.status)) throw new ApiError(400, 'Invalid status');
  const msg = await ContactMessage.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!msg) throw new ApiError(404, 'Message not found');
  res.json({ message: msg });
});
exports.getSettings = asyncHandler(async (req, res) => res.json({ settings: await Setting.get() }));
exports.updateSettings = asyncHandler(async (req, res) => {
  const s = await Setting.get();
  s.set(pick(req.body, ['siteName', 'contactEmail', 'contactPhone', 'address', 'workingHours', 'facebook', 'instagram', 'youtube', 'whatsapp', 'deliveryCharge', 'freeDeliveryAbove']));
  await s.save();
  res.json({ settings: s });
});
