const logger = require('../utils/logger');

const notFound = (req, res, next) => {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Server error';

  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ') || 'field'}`;
  } else if (err.name === 'MulterError') {
    status = 400;
  }

  if (status >= 500) logger.error(err);
  res.status(status).json({ message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Server error' : message });
};

module.exports = { notFound, errorHandler };
