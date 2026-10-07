const mongoose = require('mongoose');

module.exports = mongoose.model(
  'Notification',
  new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      forAdmin: { type: Boolean, default: false },
      type: String,
      title: String,
      message: String,
      link: String,
      isRead: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);
