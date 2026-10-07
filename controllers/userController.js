// Authenticated user features: bookings, orders, addresses, wishlist, reviews, dashboard
const Booking = require('../models/Booking');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Puja = require('../models/Puja');
const Pandit = require('../models/Pandit');
const Address = require('../models/Address');
const Coupon = require('../models/Coupon');
const Review = require('../models/Review');
const User = require('../models/User');
const Counter = require('../models/Counter');
const Notification = require('../models/Notification');
const { asyncHandler, ApiError, pagination, paged } = require('../utils/helpers');
const email = require('../services/emailService');
const { evaluateCoupon, deliveryChargeFor, recalcRating, notifyAdmin } = require('../services/commerce');
const { ACTIVE_BOOKING_STATUSES, CLOSED_BOOKING_STATUSES, CLOSED_ORDER_STATUSES, PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD } = require('../config/constants');

const req_ = (v, label) => {
  if (v === undefined || v === null || String(v).trim() === '') throw new ApiError(400, `${label} is required`);
  return String(v).trim();
};

// ---------- Bookings ----------
exports.createBooking = asyncHandler(async (req, res) => {
  const b = req.body;
  const puja = await Puja.findOne({ _id: b.puja, isActive: true });
  if (!puja) throw new ApiError(400, 'Selected Puja is not available');

  let pandit = null;
  if (b.pandit) {
    pandit = await Pandit.findOne({ _id: b.pandit, isActive: true });
    if (!pandit) throw new ApiError(400, 'Selected Pandit is not available');
    if (!pandit.availability?.isAvailable) throw new ApiError(400, 'This Pandit is currently not accepting bookings');
  }

  const date = new Date(b.date);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'A valid date is required');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) throw new ApiError(400, 'Booking date cannot be in the past');
  const time = req_(b.time, 'Time');

  if (pandit) {
    const clash = await Booking.findOne({
      pandit: pandit._id,
      date,
      time,
      bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    });
    if (clash) throw new ApiError(409, 'This Pandit is already booked for the selected slot. Please choose another time.');
  }

  const year = new Date().getFullYear();
  const seq = await Counter.next(`booking-${year}`);
  const booking = await Booking.create({
    bookingId: `BP-${year}-${String(seq).padStart(6, '0')}`,
    user: req.user._id,
    pandit: pandit?._id,
    puja: puja._id,
    date,
    time,
    customerName: req_(b.customerName, 'Name'),
    phone: req_(b.phone, 'Phone'),
    email: req_(b.email, 'Email'),
    address: req_(b.address, 'Address'),
    city: req_(b.city, 'City'),
    state: req_(b.state, 'State'),
    pincode: req_(b.pincode, 'Pincode'),
    additionalRequirements: b.additionalRequirements,
    amount: pandit?.priceFrom || puja.priceFrom || 0, // computed server-side, never trusted from client
    bookingStatus: 'PENDING',
    paymentStatus: 'PENDING',
  });
  await booking.populate(['puja', 'pandit']);

  email.sendBookingCreatedEmail(booking);
  email.sendAdminNewBookingEmail(booking);
  notifyAdmin('NEW_BOOKING', 'New booking request', `${booking.bookingId} — ${puja.name}`, `/admin/bookings/${booking._id}`);
  res.status(201).json({ booking });
});

exports.myBookings = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.status) filter.bookingStatus = req.query.status;
  const pg = pagination(req.query, 10);
  const [items, total] = await Promise.all([
    Booking.find(filter).populate('puja', 'name slug image').populate('pandit', 'name profileImage').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Booking.countDocuments(filter),
  ]);
  res.json(paged(items, total, pg));
});

const ownBooking = async (req) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  return booking;
};

exports.getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id }).populate('puja', 'name slug image').populate('pandit', 'name profileImage phone city');
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.json({ booking });
});

exports.requestCancellation = asyncHandler(async (req, res) => {
  const booking = await ownBooking(req);
  if (CLOSED_BOOKING_STATUSES.includes(booking.bookingStatus)) throw new ApiError(400, `A ${booking.bookingStatus.toLowerCase()} booking cannot be cancelled`);
  booking.cancellationRequested = true;
  booking.cancellationReason = req.body.reason || '';
  await booking.save();
  notifyAdmin('CANCEL_REQUEST', 'Cancellation requested', booking.bookingId, `/admin/bookings/${booking._id}`);
  res.json({ booking, message: 'Cancellation request sent. Our team will confirm shortly.' });
});

exports.requestReschedule = asyncHandler(async (req, res) => {
  const booking = await ownBooking(req);
  if (CLOSED_BOOKING_STATUSES.includes(booking.bookingStatus)) throw new ApiError(400, `A ${booking.bookingStatus.toLowerCase()} booking cannot be rescheduled`);
  const date = new Date(req.body.date);
  if (Number.isNaN(date.getTime()) || date < new Date(new Date().setHours(0, 0, 0, 0))) throw new ApiError(400, 'Please choose a valid future date');
  booking.rescheduleRequest = { requested: true, date, time: req_(req.body.time, 'Time'), reason: req.body.reason || '' };
  await booking.save();
  notifyAdmin('RESCHEDULE_REQUEST', 'Reschedule requested', booking.bookingId, `/admin/bookings/${booking._id}`);
  res.json({ booking, message: 'Reschedule request sent. Our team will confirm shortly.' });
});

// ---------- Orders ----------
exports.createOrder = asyncHandler(async (req, res) => {
  const { items, shipping, couponCode } = req.body;
  const paymentMethod = req.body.paymentMethod || DEFAULT_PAYMENT_METHOD;
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new ApiError(400, 'Unsupported payment method');
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Your cart is empty');
  const s = shipping || {};
  const ship = {
    fullName: req_(s.fullName, 'Full name'),
    phone: req_(s.phone, 'Phone'),
    email: req_(s.email, 'Email'),
    address: req_(s.address, 'Address'),
    city: req_(s.city, 'City'),
    state: req_(s.state, 'State'),
    pincode: req_(s.pincode, 'Pincode'),
  };

  // Merge duplicate lines and load authoritative product data
  const qtyById = new Map();
  for (const it of items) {
    const qty = parseInt(it.quantity, 10);
    if (!it.product || !(qty > 0)) throw new ApiError(400, 'Invalid cart item');
    qtyById.set(String(it.product), (qtyById.get(String(it.product)) || 0) + qty);
  }
  const products = await Product.find({ _id: { $in: [...qtyById.keys()] }, isActive: true });
  if (products.length !== qtyById.size) throw new ApiError(400, 'Some items in your cart are no longer available');

  let subtotal = 0;
  const lines = products.map((p) => {
    const quantity = qtyById.get(String(p._id));
    if (p.stock < quantity) throw new ApiError(400, `Only ${p.stock} left in stock for "${p.name}"`);
    const price = p.sellingPrice;
    subtotal += price * quantity;
    return { product: p._id, name: p.name, image: p.images?.[0], sku: p.sku, price, quantity, subtotal: price * quantity };
  });

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const result = await evaluateCoupon(couponCode, subtotal);
    discount = result.discount;
    // atomic usage-limit guard
    coupon = await Coupon.findOneAndUpdate(
      { _id: result.coupon._id, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
      { $inc: { usedCount: 1 } },
      { new: true }
    );
    if (!coupon) throw new ApiError(400, 'This coupon has reached its usage limit');
  }

  const deliveryCharge = await deliveryChargeFor(subtotal);
  const year = new Date().getFullYear();
  const seq = await Counter.next(`order-${year}`);
  const order = await Order.create({
    orderId: `BP${year % 100}${String(seq).padStart(5, '0')}`,
    user: req.user._id,
    shipping: ship,
    subtotal,
    deliveryCharge,
    discount,
    total: Math.max(0, subtotal - discount + deliveryCharge),
    coupon: coupon?._id,
    couponCode: coupon?.code,
    paymentMethod,
    paymentStatus: paymentMethod === 'COD' ? 'COD' : 'PENDING',
    orderStatus: 'PLACED',
    statusHistory: [{ status: 'PLACED' }],
  });
  const created = await OrderItem.insertMany(lines.map((l) => ({ ...l, order: order._id })));
  order.items = created.map((i) => i._id);
  await order.save();
  await order.populate('items');

  email.sendOrderPlacedEmail(order);
  email.sendAdminNewOrderEmail(order);
  notifyAdmin('NEW_ORDER', 'New order', `${order.orderId} — ₹${order.total}`, `/admin/orders/${order._id}`);
  res.status(201).json({ order });
});

exports.myOrders = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.status) filter.orderStatus = req.query.status;
  const pg = pagination(req.query, 10);
  const [items, total] = await Promise.all([
    Order.find(filter).populate('items').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Order.countDocuments(filter),
  ]);
  res.json(paged(items, total, pg));
});

exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).populate({ path: 'items', populate: { path: 'product', select: 'slug' } });
  if (!order) throw new ApiError(404, 'Order not found');
  const reviewed = await Review.find({ user: req.user._id, order: order._id }).select('product');
  res.json({ order, reviewedProducts: reviewed.map((r) => String(r.product)) });
});

exports.validateCoupon = asyncHandler(async (req, res) => {
  const subtotal = Number(req.body.subtotal) || 0;
  const { coupon, discount } = await evaluateCoupon(req.body.code, subtotal);
  res.json({ code: coupon.code, discount, description: coupon.description });
});

// ---------- Addresses ----------
exports.listAddresses = asyncHandler(async (req, res) => {
  res.json({ items: await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 }) });
});

const addressFields = (b) => ({
  label: b.label || 'Home',
  fullName: req_(b.fullName, 'Full name'),
  phone: req_(b.phone, 'Phone'),
  address: req_(b.address, 'Address'),
  city: req_(b.city, 'City'),
  state: req_(b.state, 'State'),
  pincode: req_(b.pincode, 'Pincode'),
  isDefault: !!b.isDefault,
});

exports.createAddress = asyncHandler(async (req, res) => {
  const data = addressFields(req.body);
  if (data.isDefault) await Address.updateMany({ user: req.user._id }, { isDefault: false });
  const address = await Address.create({ ...data, user: req.user._id });
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { addresses: address._id } });
  res.status(201).json({ address });
});

exports.updateAddress = asyncHandler(async (req, res) => {
  const data = addressFields(req.body);
  if (data.isDefault) await Address.updateMany({ user: req.user._id }, { isDefault: false });
  const address = await Address.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, data, { new: true });
  if (!address) throw new ApiError(404, 'Address not found');
  res.json({ address });
});

exports.deleteAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!address) throw new ApiError(404, 'Address not found');
  await User.findByIdAndUpdate(req.user._id, { $pull: { addresses: address._id } });
  res.json({ message: 'Address deleted' });
});

// ---------- Wishlist ----------
exports.getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({ path: 'wishlist', match: { isActive: true } });
  res.json({ items: user.wishlist });
});

exports.toggleWishlist = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw new ApiError(404, 'Product not found');
  const has = req.user.wishlist.some((id) => String(id) === String(product._id));
  await User.findByIdAndUpdate(req.user._id, has ? { $pull: { wishlist: product._id } } : { $addToSet: { wishlist: product._id } });
  res.json({ wishlisted: !has });
});

exports.wishlistIds = asyncHandler(async (req, res) => {
  res.json({ ids: req.user.wishlist.map(String) });
});

// ---------- Reviews ----------
exports.createReview = asyncHandler(async (req, res) => {
  const { bookingId, orderId, productId } = req.body;
  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) throw new ApiError(400, 'Rating must be between 1 and 5');
  const comment = (req.body.comment || '').trim().slice(0, 1500);

  let doc;
  if (bookingId) {
    const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
    if (!booking) throw new ApiError(404, 'Booking not found');
    if (booking.bookingStatus !== 'COMPLETED') throw new ApiError(400, 'You can review a booking only after it is completed');
    // A booking review covers the Pandit (when assigned) and the Puja service
    doc = { user: req.user._id, targetType: booking.pandit ? 'PANDIT' : 'PUJA', pandit: booking.pandit, puja: booking.puja, booking: booking._id, rating, comment };
  } else if (orderId && productId) {
    const order = await Order.findOne({ _id: orderId, user: req.user._id }).populate('items');
    if (!order) throw new ApiError(404, 'Order not found');
    if (order.orderStatus !== 'DELIVERED') throw new ApiError(400, 'You can review products only after delivery');
    if (!order.items.some((i) => String(i.product) === String(productId))) throw new ApiError(400, 'This product is not part of the order');
    doc = { user: req.user._id, targetType: 'PRODUCT', product: productId, order: order._id, rating, comment };
  } else {
    throw new ApiError(400, 'bookingId, or orderId with productId, is required');
  }

  let review;
  try {
    review = await Review.create(doc);
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You have already reviewed this');
    throw err;
  }
  if (doc.booking) await Booking.findByIdAndUpdate(doc.booking, { reviewed: true });
  await recalcRating(review);
  res.status(201).json({ review });
});

// ---------- Dashboard ----------
exports.dashboard = asyncHandler(async (req, res) => {
  const uid = req.user._id;
  const active = ACTIVE_BOOKING_STATUSES;
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const [totalBookings, upcomingCount, completed, totalOrders, upcomingBooking, latestOrder, notifications] = await Promise.all([
    Booking.countDocuments({ user: uid }),
    Booking.countDocuments({ user: uid, bookingStatus: { $in: active }, date: { $gte: startOfToday } }),
    Booking.countDocuments({ user: uid, bookingStatus: 'COMPLETED' }),
    Order.countDocuments({ user: uid }),
    Booking.findOne({ user: uid, bookingStatus: { $in: active }, date: { $gte: startOfToday } }).sort({ date: 1 }).populate('puja', 'name slug image').populate('pandit', 'name'),
    Order.findOne({ user: uid, orderStatus: { $nin: CLOSED_ORDER_STATUSES } }).sort({ createdAt: -1 }).populate('items'),
    Notification.find({ user: uid }).sort({ createdAt: -1 }).limit(5),
  ]);
  res.json({
    stats: { totalBookings, upcomingBookings: upcomingCount, completedPujas: completed, totalOrders },
    upcomingBooking,
    upcomingOrder: latestOrder,
    notifications,
  });
});
