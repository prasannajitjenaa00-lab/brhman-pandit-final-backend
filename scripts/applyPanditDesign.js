// One-off: points the six featured Pandits at their portrait photos in uploads/seed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Pandit = require('../models/Pandit');
const { slugify } = require('../utils/helpers');

const STATS = { 'pt-suresh-sharma': [4.9, 156], 'pt-harish-vyas': [4.9, 133], 'pt-gopal-acharya': [4.8, 117], 'pt-krishna-bhatt': [4.8, 152], 'pt-ashok-dwivedi': [4.8, 85], 'pt-narayan-das': [4.7, 95] };

(async () => {
  await connectDB();
  let n = 0;
  for (const p of await Pandit.find()) {
    const f = `pandit-${slugify(p.name)}.jpg`;
    if (fs.existsSync(path.join(__dirname, '..', 'uploads', 'seed', f))) { p.profileImage = `/uploads/seed/${f}`;
      const st = STATS[slugify(p.name)];
      if (st) { p.rating = st[0]; p.totalReviews = st[1]; }
      await p.save(); n++; }
  }
  console.log('Updated', n, 'pandit photos');
  process.exit(0);
})();
