const mongoose = require('mongoose');

const logger = require('../utils/logger');

// The localhost fallback is for local development only; production must set MONGO_URI.
const DEV_URI = 'mongodb://127.0.0.1:27017/brahmam_pandit';

module.exports = async function connectDB() {
  if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) throw new Error('MONGO_URI must be set in production');
  const uri = process.env.MONGO_URI || DEV_URI;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
};
