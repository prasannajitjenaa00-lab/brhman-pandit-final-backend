const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect, adminOnly } = require('../middleware/auth');
const { imageUpload, documentUpload } = require('../middleware/upload');
const auth = require('../controllers/authController');
const catalog = require('../controllers/catalogController');
const user = require('../controllers/userController');
const contact = require('../controllers/contactController');
const admin = require('../controllers/adminController');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please try again later.' } });
const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many submissions. Please try again later.' } });

// ---------- Auth ----------
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/verify-otp', authLimiter, auth.verifyOtp);
router.post('/auth/resend-otp', authLimiter, auth.resendOtp);
router.post('/auth/logout', auth.logout);
router.post('/auth/forgot-password', authLimiter, auth.forgotPassword);
router.post('/auth/reset-password/:token', authLimiter, auth.resetPassword);
router.get('/auth/me', protect, auth.me);
router.put('/auth/me', protect, auth.updateProfile);
router.put('/auth/change-password', protect, auth.changePassword);

// ---------- Public catalog ----------
router.get('/pujas', catalog.listPujas);
router.get('/pujas/:slug', catalog.getPuja);
router.get('/meta', catalog.meta);
router.get('/pandits/filters', catalog.panditFilters);
router.get('/pandits', catalog.listPandits);
router.get('/pandits/:id', catalog.getPandit);
router.get('/categories', catalog.listCategories);
router.get('/products', catalog.listProducts);
router.get('/products/filters', catalog.productFilters);
router.get('/products/by-ids', catalog.productsByIds);
router.get('/products/:slug', catalog.getProduct);
router.get('/settings', catalog.publicSettings);
router.post('/contact', formLimiter, contact.submit);

// ---------- Authenticated user ----------
const u = express.Router();
u.use(protect);
u.get('/dashboard', user.dashboard);
u.post('/bookings', user.createBooking);
u.get('/bookings', user.myBookings);
u.get('/bookings/:id', user.getBooking);
u.post('/bookings/:id/cancel-request', user.requestCancellation);
u.post('/bookings/:id/reschedule-request', user.requestReschedule);
u.post('/orders', user.createOrder);
u.get('/orders', user.myOrders);
u.get('/orders/:id', user.getOrder);
u.post('/coupons/validate', user.validateCoupon);
u.get('/addresses', user.listAddresses);
u.post('/addresses', user.createAddress);
u.put('/addresses/:id', user.updateAddress);
u.delete('/addresses/:id', user.deleteAddress);
u.get('/wishlist', user.getWishlist);
u.get('/wishlist/ids', user.wishlistIds);
u.post('/wishlist/:productId', user.toggleWishlist);
u.post('/reviews', user.createReview);
router.use('/me', u);

// ---------- Admin ----------
const a = express.Router();
a.use(protect, adminOnly);
a.get('/stats', admin.stats);
a.get('/notifications', admin.notifications);
a.post('/notifications/read', admin.markNotificationsRead);

a.get('/users', admin.listUsers);
a.get('/users/:id', admin.getUser);
a.patch('/users/:id/block', admin.setBlocked(true));
a.patch('/users/:id/unblock', admin.setBlocked(false));

const panditFiles = documentUpload.fields([{ name: 'profileImage', maxCount: 1 }, { name: 'documents', maxCount: 6 }]);
a.get('/pandits', admin.listPandits);
a.post('/pandits', panditFiles, admin.createPandit);
a.get('/pandits/:id', admin.getPandit);
a.put('/pandits/:id', panditFiles, admin.updatePandit);
a.delete('/pandits/:id', admin.deactivatePandit);
a.get('/pandits/:id/documents/:docId', admin.downloadPanditDocument);

a.get('/pujas', admin.listPujas);
a.post('/pujas', imageUpload.single('image'), admin.createPuja);
a.get('/pujas/:id', admin.getPuja);
a.put('/pujas/:id', imageUpload.single('image'), admin.updatePuja);
a.delete('/pujas/:id', admin.deactivatePuja);

a.get('/categories', admin.listCategories);
a.post('/categories', imageUpload.single('image'), admin.createCategory);
a.put('/categories/:id', imageUpload.single('image'), admin.updateCategory);
a.delete('/categories/:id', admin.deleteCategory);

a.get('/products', admin.listProducts);
a.post('/products', imageUpload.array('images', 8), admin.createProduct);
a.get('/products/:id', admin.getProduct);
a.put('/products/:id', imageUpload.array('images', 8), admin.updateProduct);
a.delete('/products/:id', admin.deactivateProduct);

a.get('/inventory', admin.inventory);
a.patch('/inventory/:id', admin.updateStock);

a.get('/bookings', admin.listBookings);
a.get('/bookings/:id', admin.getBooking);
a.patch('/bookings/:id', admin.updateBooking);

a.get('/orders', admin.listOrders);
a.get('/orders/:id', admin.getOrder);
a.patch('/orders/:id', admin.updateOrder);

a.get('/reviews', admin.listReviews);
a.patch('/reviews/:id', admin.setReviewStatus);
a.delete('/reviews/:id', admin.deleteReview);

a.get('/coupons', admin.listCoupons);
a.post('/coupons', admin.createCoupon);
a.put('/coupons/:id', admin.updateCoupon);
a.delete('/coupons/:id', admin.deleteCoupon);

a.get('/messages', admin.listMessages);
a.patch('/messages/:id', admin.updateMessage);

a.get('/settings', admin.getSettings);
a.put('/settings', admin.updateSettings);
router.use('/admin', a);

module.exports = router;
