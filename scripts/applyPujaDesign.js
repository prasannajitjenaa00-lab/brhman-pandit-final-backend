// One-off: sets Puja categories and the photo files in uploads/seed for existing records.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Puja = require('../models/Puja');

const CAT = { 'griha-pravesh-puja': 'Home & Family', 'vastu-puja': 'Home & Family', 'satyanarayan-puja': 'Home & Family', 'lakshmi-puja': 'Health & Prosperity', 'ganesh-puja': 'Health & Prosperity', 'navgraha-puja': 'Health & Prosperity', 'marriage-puja': 'Marriage & Life Events', naamkaran: 'Marriage & Life Events', rudrabhishek: 'Spiritual & Vedic', havan: 'Spiritual & Vedic' };

(async () => {
  await connectDB();
  for (const p of await Puja.find()) {
    p.category = CAT[p.slug] || 'Other Ceremonies';
    if (fs.existsSync(path.join(__dirname, '..', 'uploads', 'seed', `puja-${p.slug}.jpg`))) p.image = `/uploads/seed/puja-${p.slug}.jpg`;
    await p.save();
  }
  console.log('Updated', await Puja.countDocuments(), 'pujas');
  process.exit(0);
})();
