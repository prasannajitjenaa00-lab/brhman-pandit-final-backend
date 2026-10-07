const ContactMessage = require('../models/ContactMessage');
const { asyncHandler, ApiError } = require('../utils/helpers');
const { CONTACT_SUBJECTS } = require('../config/constants');
const email = require('../services/emailService');
const { notifyAdmin } = require('../services/commerce');

exports.submit = asyncHandler(async (req, res) => {
  const [name, mail, phone, subject, message] = ['name', 'email', 'phone', 'subject', 'message'].map((k) => (typeof req.body[k] === 'string' ? req.body[k] : ''));
  if (!name?.trim() || !subject?.trim() || !message?.trim()) throw new ApiError(400, 'Name, subject and message are required');
  if (!CONTACT_SUBJECTS.includes(subject.trim())) throw new ApiError(400, 'Please choose a valid subject');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail || '')) throw new ApiError(400, 'A valid email is required');
  const msg = await ContactMessage.create({
    name: name.trim().slice(0, 100),
    email: mail.trim(),
    phone: phone?.trim().slice(0, 20),
    subject: subject.trim().slice(0, 150),
    message: message.trim().slice(0, 3000),
  });
  email.sendContactAdminEmail(msg);
  email.sendContactAckEmail(msg);
  notifyAdmin('CONTACT', 'New enquiry', msg.subject, '/admin');
  res.status(201).json({ message: 'Thank you! We will get back to you shortly.' });
});
