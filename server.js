require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const routes = require('./routes');
const sanitize = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/error');
const logger = require('./utils/logger');

const isProd = process.env.NODE_ENV === 'production';

// Refuse to boot with a missing/weak/placeholder secret in production.
const WEAK_SECRETS = ['change-this-to-a-long-random-string', 'dev-secret-please-change-0123456789'];
const secret = process.env.JWT_SECRET || '';
if (secret.length < 16 || (isProd && (secret.length < 32 || WEAK_SECRETS.includes(secret)))) {
  logger.error('JWT_SECRET is missing or too weak. Use a random value of 32+ characters (e.g. `openssl rand -hex 48`).');
  process.exit(1);
}
if (isProd && !process.env.CLIENT_URL) {
  logger.error('CLIENT_URL must be set in production (used for CORS and email links).');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // behind Nginx
app.set('query parser', 'simple'); // no nested query objects => no operator injection via ?a[$ne]=x

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(sanitize);
if (!isProd) app.use(morgan('dev'));

// Public images only. Verification documents live in private_uploads and are never served statically.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => logger.info(`API listening on :${PORT}`)))
  .catch((err) => {
    logger.error('Failed to start:', err.message);
    process.exit(1);
  });
