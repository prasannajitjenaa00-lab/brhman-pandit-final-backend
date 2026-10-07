const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'emails');
const cache = {};

const appUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
const adminEmail = () => process.env.ADMIN_EMAIL;

let transporter;
const getTransporter = () => {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    transporter = null;
    return null;
  }
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: {
      rejectUnauthorized: false,
    },
  });
  return transporter;
};

const readTemplate = (name) => {
  if (!cache[name] || process.env.NODE_ENV !== 'production') {
    cache[name] = fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8');
  }
  return cache[name];
};

const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// {{var}} is HTML-escaped; {{{var}}} is inserted raw (only used for trusted, pre-built HTML)
const render = (tpl, data) =>
  tpl
    .replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_, k) => data[k] ?? '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => escapeHtml(data[k]));

// Plain-text alternative: HTML-only mail is a spam signal, and some clients prefer text.
const toText = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|h\d|tr|div|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const rows = (pairs) =>
  pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#8a6d5a;font-size:14px;width:40%">${escapeHtml(k)}</td><td style="padding:8px 0;color:#3b2417;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`
    )
    .join('');

async function send({ to, subject, template, data = {}, cta }) {
  try {
    const t = getTransporter();
    const body = render(readTemplate(template), data);
    const html = render(readTemplate('_layout'), {
      subject,
      content: body,
      ctaBlock: cta
        ? `<p style="text-align:center;margin:28px 0 8px"><a href="${escapeHtml(cta.url)}" style="background:#7b1e3a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600;font-size:15px;display:inline-block">${escapeHtml(cta.text)}</a></p>`
        : '',
      appUrl: appUrl(),
      supportEmail: process.env.SUPPORT_EMAIL || adminEmail() || '',
      supportPhone: process.env.SUPPORT_PHONE || '',
    });
    if (!t) {
      logger.info(`[email:disabled] "${subject}" -> ${to} (configure SMTP_* to send)`);
      return false;
    }
    const from = process.env.EMAIL_FROM || `"Brahmam Pandit" <${process.env.SMTP_USER}>`;
    await t.sendMail({ from, replyTo: process.env.SUPPORT_EMAIL || process.env.SMTP_USER, to, subject, html, text: toText(html) });
    return true;
  } catch (err) {
    // Email failure must never break the business flow
    logger.error(`[email] failed "${subject}" -> ${to}:`, err.message);
    return false;
  }
}

const bookingDetails = (b) =>
  rows([
    ['Booking ID', b.bookingId],
    ['Puja', b.puja?.name],
    ['Pandit', b.pandit?.name || 'To be assigned'],
    ['Date', fmtDate(b.date)],
    ['Time', b.time],
    ['Location', [b.address, b.city, b.state, b.pincode].filter(Boolean).join(', ')],
    ['Estimated amount', b.amount ? money(b.amount) : ''],
  ]);

const orderDetails = (o) =>
  rows([
    ['Order ID', o.orderId],
    ['Items', (o.items || []).map((i) => `${i.name} × ${i.quantity}`).join(', ')],
    ['Total', money(o.total)],
    ['Payment', o.paymentMethod === 'COD' ? 'Cash on Delivery / Pay Later' : o.paymentMethod],
    ['Deliver to', [o.shipping?.address, o.shipping?.city, o.shipping?.state, o.shipping?.pincode].filter(Boolean).join(', ')],
    ['Tracking', o.trackingNumber],
  ]);

const bookingMail = (to, subject, template, b, extra = {}) =>
  send({
    to,
    subject,
    template,
    data: { name: b.customerName, details: bookingDetails(b), ...extra },
    cta: { text: 'View Booking', url: `${appUrl()}/dashboard/bookings/${b._id}` },
  });

const orderMail = (to, subject, template, o) =>
  send({
    to,
    subject,
    template,
    data: { name: o.shipping?.fullName, details: orderDetails(o) },
    cta: { text: 'Track Order', url: `${appUrl()}/dashboard/orders/${o._id}` },
  });

module.exports = {
  isConfigured: () => !!getTransporter(),

  sendOtpEmail: (user, otp, minutes) =>
    send({
      to: user.email,
      subject: `${otp} is your Brahmam Pandit verification code`,
      template: 'otp',
      data: { name: user.name, otp, minutes },
    }),

  sendWelcomeEmail: (user) =>
    send({
      to: user.email,
      subject: 'Welcome to Brahmam Pandit 🙏',
      template: 'welcome',
      data: { name: user.name },
      cta: { text: 'Explore Brahmam Pandit', url: appUrl() },
    }),

  sendBookingCreatedEmail: (b) => bookingMail(b.email, `Booking request received — ${b.bookingId}`, 'booking-created', b),
  sendBookingConfirmedEmail: (b) => bookingMail(b.email, `Booking confirmed — ${b.bookingId}`, 'booking-confirmed', b),
  sendBookingCancelledEmail: (b) => bookingMail(b.email, `Booking cancelled — ${b.bookingId}`, 'booking-cancelled', b),
  sendBookingRescheduledEmail: (b) => bookingMail(b.email, `Booking rescheduled — ${b.bookingId}`, 'booking-rescheduled', b),

  sendOrderPlacedEmail: (o) => orderMail(o.shipping.email, `Order placed — ${o.orderId}`, 'order-placed', o),
  sendOrderConfirmedEmail: (o) => orderMail(o.shipping.email, `Order confirmed — ${o.orderId}`, 'order-confirmed', o),
  sendOrderShippedEmail: (o) => orderMail(o.shipping.email, `Order shipped — ${o.orderId}`, 'order-shipped', o),
  sendOrderDeliveredEmail: (o) => orderMail(o.shipping.email, `Order delivered — ${o.orderId}`, 'order-delivered', o),

  sendPasswordResetEmail: (user, token) =>
    send({
      to: user.email,
      subject: 'Reset your Brahmam Pandit password',
      template: 'password-reset',
      data: { name: user.name },
      cta: { text: 'Reset Password', url: `${appUrl()}/reset-password/${token}` },
    }),

  sendAdminNewBookingEmail: (b) =>
    adminEmail() &&
    send({
      to: adminEmail(),
      subject: `New booking request — ${b.bookingId}`,
      template: 'admin-new-booking',
      data: { details: bookingDetails(b), customer: `${b.customerName} (${b.phone})` },
      cta: { text: 'Open in Admin', url: `${appUrl()}/admin/bookings/${b._id}` },
    }),

  sendAdminNewOrderEmail: (o) =>
    adminEmail() &&
    send({
      to: adminEmail(),
      subject: `New order — ${o.orderId}`,
      template: 'admin-new-order',
      data: { details: orderDetails(o), customer: `${o.shipping?.fullName} (${o.shipping?.phone})` },
      cta: { text: 'Open in Admin', url: `${appUrl()}/admin/orders/${o._id}` },
    }),

  sendAdminNewUserEmail: (user) =>
    adminEmail() &&
    send({
      to: adminEmail(),
      subject: `New user registered — ${user.name}`,
      template: 'admin-new-user',
      data: { details: rows([['Name', user.name], ['Email', user.email], ['Phone', user.phone]]) },
      cta: { text: 'View Users', url: `${appUrl()}/admin/users` },
    }),

  sendContactAdminEmail: (m) =>
    adminEmail() &&
    send({
      to: adminEmail(),
      subject: `New enquiry: ${m.subject}`,
      template: 'admin-new-contact',
      data: { details: rows([['Name', m.name], ['Email', m.email], ['Phone', m.phone], ['Subject', m.subject]]), message: m.message },
    }),

  sendContactAckEmail: (m) =>
    send({
      to: m.email,
      subject: 'We received your message — Brahmam Pandit',
      template: 'contact-ack',
      data: { name: m.name },
    }),
};
