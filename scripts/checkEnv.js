// Pre-deploy sanity check of backend/.env. Exits 1 when something would break or be unsafe in production.
// Usage: node scripts/checkEnv.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const env = process.env;
const errors = [];
const warnings = [];
const WEAK = ['change-this-to-a-long-random-string', 'dev-secret-please-change-0123456789'];
const SAMPLE_EMAILS = /@example\.(com|org|net)$/i;

if (env.NODE_ENV !== 'production') errors.push('NODE_ENV must be "production".');

if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || WEAK.includes(env.JWT_SECRET)) errors.push('JWT_SECRET must be a random value of 32+ characters (openssl rand -hex 48).');

if (!env.MONGO_URI) errors.push('MONGO_URI is not set.');
else if (/localhost|127\.0\.0\.1/.test(env.MONGO_URI) && !env.MONGO_URI.includes('@')) warnings.push('MONGO_URI points at a MongoDB without credentials. Enable MongoDB authentication.');

if (!/^https:\/\//.test(env.CLIENT_URL || '')) errors.push('CLIENT_URL must be your public https:// address (used for CORS, cookies and email links).');
if (env.COOKIE_SECURE === 'false') errors.push('COOKIE_SECURE=false disables secure cookies. Remove it in production.');

for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) if (!env[k]) errors.push(`${k} is not set - OTP verification and order emails will not be sent.`);
if (!env.ADMIN_EMAIL || SAMPLE_EMAIL(env.ADMIN_EMAIL)) warnings.push('ADMIN_EMAIL is empty or a sample address - admin alerts will not reach you.');
if (!env.SUPPORT_EMAIL || SAMPLE_EMAIL(env.SUPPORT_EMAIL)) warnings.push('SUPPORT_EMAIL is empty or a sample address - it appears in every email footer.');

if (!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)) warnings.push('Cloudinary is not configured - images are stored on the server disk (back up backend/uploads).');
if (env.SEED_ADMIN_PASSWORD === 'ChangeMe@12345') errors.push('SEED_ADMIN_PASSWORD is still the old default.');

function SAMPLE_EMAIL(v) {
  return SAMPLE_EMAILS.test(String(v || ''));
}

warnings.forEach((w) => console.warn(`  warning: ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`  ERROR: ${e}`));
  console.error(`\nFix ${errors.length} problem(s) in backend/.env and run again.`);
  process.exit(1);
}
console.log('  Environment looks production-ready.');
