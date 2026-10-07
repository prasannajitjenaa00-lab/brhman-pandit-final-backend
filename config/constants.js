// Single source of truth for domain enums and defaults. The frontend reads these through GET /api/meta
// so statuses, categories and slots are never duplicated in the UI.

const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED'];
const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'RESCHEDULED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'PARTIAL', 'COD', 'NOT_REQUIRED'];
const CLOSED_BOOKING_STATUSES = ['COMPLETED', 'CANCELLED'];
const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const OPEN_ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED']; // not yet handed to the courier
const CLOSED_ORDER_STATUSES = ['DELIVERED', 'CANCELLED'];
const PANDIT_DOCUMENT_TYPES = ['ID_PROOF', 'ADDRESS_PROOF', 'OTHER'];
const REVIEW_TYPES = ['PANDIT', 'PUJA', 'PRODUCT'];
const REVIEW_STATUSES = ['APPROVED', 'HIDDEN'];
const CONTACT_STATUSES = ['NEW', 'READ', 'RESOLVED'];

const PUJA_CATEGORIES = ['Home & Family', 'Health & Prosperity', 'Marriage & Life Events', 'Spiritual & Vedic', 'Other Ceremonies'];
const DEFAULT_PUJA_CATEGORY = 'Other Ceremonies';

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_SLOTS = ['06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM'];
const DEFAULT_PANDIT_SLOTS = ['06:00 AM', '08:00 AM', '10:00 AM', '12:00 PM', '04:00 PM', '06:00 PM'];

// V1 has no online gateway; add e.g. 'ONLINE' here when services/paymentService.js is implemented.
const PAYMENT_METHODS = ['COD'];
const DEFAULT_PAYMENT_METHOD = 'COD';

const CONTACT_SUBJECTS = ['Puja Services', 'Booking Process', 'Order & Delivery', 'Cancellation Policy', 'Payment Information', 'Other Queries'];

module.exports = {
  BOOKING_STATUSES, ACTIVE_BOOKING_STATUSES, CLOSED_BOOKING_STATUSES, PAYMENT_STATUSES, ORDER_STATUSES, OPEN_ORDER_STATUSES, CLOSED_ORDER_STATUSES, PANDIT_DOCUMENT_TYPES, REVIEW_TYPES, REVIEW_STATUSES, CONTACT_STATUSES,
  PUJA_CATEGORIES, DEFAULT_PUJA_CATEGORY, WEEK_DAYS, TIME_SLOTS, DEFAULT_PANDIT_SLOTS, PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD, CONTACT_SUBJECTS,
};
