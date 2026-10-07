const mongoose = require('mongoose');

const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));

// Atomically increment and return the next sequence number for a key.
Counter.next = async (key) => {
  const doc = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
};

module.exports = Counter;
