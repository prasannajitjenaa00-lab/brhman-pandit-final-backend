/**
 * Payment abstraction (V1: no online gateway).
 *
 * Orders and bookings already carry `paymentStatus` and a `payment` sub-document
 * ({ provider, transactionId, paidAmount }). To add a gateway later:
 *   0. Add the method (e.g. 'ONLINE') to PAYMENT_METHODS in config/constants.js.
 *   1. Implement createPayment / verifyPayment below for the chosen provider.
 *   2. Call createPayment from the order/booking controllers when the user chooses "ONLINE".
 *   3. Add a webhook route that calls markPaid().
 * No controller needs to change its data model.
 */
async function createPayment() {
  throw new Error('Online payments are not enabled in V1');
}

async function verifyPayment() {
  throw new Error('Online payments are not enabled in V1');
}

// Applies a successful payment to an Order or Booking document
async function markPaid(doc, { provider, transactionId, amount }) {
  doc.paymentStatus = amount >= (doc.total ?? doc.amount) ? 'PAID' : 'PARTIAL';
  doc.payment = { provider, transactionId, paidAmount: amount };
  return doc.save();
}

module.exports = { createPayment, verifyPayment, markPaid };
