// Usage: npm run seed:dummy   — adds extra dummy users, pandits and products (safe to re-run; skips existing).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Puja = require('../models/Puja');
const Pandit = require('../models/Pandit');
const { slugify } = require('../utils/helpers');

const DUMMY_PASSWORD = 'Test@12345';

const USERS = [
  ['Rahul Sharma', 'rahul@example.com', '9876500001'],
  ['Priya Das', 'priya@example.com', '9876500002'],
  ['Amit Patnaik', 'amit@example.com', '9876500003'],
  ['Sneha Mohanty', 'sneha@example.com', '9876500004'],
  ['Vikram Singh', 'vikram@example.com', '9876500005'],
];

// [name, experience, languages, city, state, priceFrom, specializations]
const PANDITS = [
  ['Pt. Dinesh Pandey', 16, ['Hindi', 'Sanskrit'], 'Lucknow', 'Uttar Pradesh', 2300, ['Satyanarayan Puja', 'Ganesh Puja', 'Havan']],
  ['Pt. Narayan Das', 28, ['Odia', 'Sanskrit', 'Hindi'], 'Puri', 'Odisha', 3200, ['Rudrabhishek', 'Marriage Puja', 'Navgraha Puja']],
  ['Pt. Krishna Bhatt', 14, ['Kannada', 'Sanskrit', 'English'], 'Mysuru', 'Karnataka', 2600, ['Griha Pravesh Puja', 'Vastu Puja', 'Lakshmi Puja']],
  ['Pt. Ashok Dwivedi', 19, ['Hindi', 'Bengali', 'Sanskrit'], 'Kolkata', 'West Bengal', 2700, ['Lakshmi Puja', 'Naamkaran', 'Satyanarayan Puja']],
  ['Pt. Harish Vyas', 11, ['Gujarati', 'Hindi', 'Sanskrit'], 'Ahmedabad', 'Gujarat', 2000, ['Ganesh Puja', 'Griha Pravesh Puja', 'Havan']],
  ['Pt. Sudarshan Rao', 23, ['Telugu', 'Sanskrit', 'English'], 'Hyderabad', 'Telangana', 3400, ['Rudrabhishek', 'Navgraha Puja', 'Marriage Puja']],
];

// [name, category, price, discountPrice, stock, description]
const PRODUCTS = [
  ['Vastu Puja Kit', 'Puja Kits', 1199, 999, 22, 'Everything needed for a traditional Vastu Shanti Puja.'],
  ['Navgraha Puja Kit', 'Puja Kits', 1399, 1199, 18, 'Nine-planet puja samagri with navdhanya and coloured cloth.'],
  ['Rudrabhishek Puja Kit', 'Puja Kits', 999, 849, 26, 'Milk, bel patra, gangajal and essentials for Rudrabhishek.'],
  ['Guggul Dhoop Cones (Pack of 30)', 'Incense', 179, 149, 110, 'Aromatic guggul dhoop cones for purifying the home.'],
  ['Nag Champa Incense Sticks (Pack of 6)', 'Incense', 199, null, 95, 'Classic nag champa fragrance for daily worship.'],
  ['Camphor Burner Set', 'Camphor', 349, 299, 40, 'Brass camphor burner with stand.'],
  ['Akhand Jyot Brass Diya', 'Diyas', 549, 479, 30, 'Large brass diya designed for long-burning akhand jyot.'],
  ['Terracotta Kalash with Lid', 'Kalash', 299, 249, 35, 'Hand-painted terracotta kalash for Puja.'],
  ['Silver-Plated Puja Thali', 'Puja Thali', 1899, 1599, 12, 'Elegant silver-plated thali with kumkum bowls and diya.'],
  ['Tulsi Mala (108 beads)', 'Rudraksha', 249, 199, 70, 'Pure tulsi wood mala for japa.'],
  ['Brass Lakshmi Idol (5 inch)', 'Idols', 1399, 1199, 14, 'Detailed brass Goddess Lakshmi idol.'],
  ['Marble Shiva Lingam (4 inch)', 'Idols', 999, 849, 16, 'Smooth white marble Shiva lingam with base.'],
  ['Ramcharitmanas (Hindi)', 'Religious Books', 449, 399, 45, 'Tulsidas Ramcharitmanas with Hindi meaning.'],
  ['Vishnu Sahasranama (Sanskrit & English)', 'Religious Books', 199, null, 55, 'Pocket edition with transliteration and meaning.'],
  ['Havan Kund (Copper)', 'Havan Samagri', 1299, 1099, 10, 'Pyramid copper havan kund for home havan.'],
  ['Sambrani Cup Dhoop (Box of 12)', 'Havan Samagri', 129, 109, 4, 'Traditional sambrani cups, long-lasting aroma.'],
  ['LED Diya String Lights', 'Decorative Items', 399, 349, 60, 'Warm-white diya-shaped lights for festivals.'],
  ['Rangoli Colour Set (12 shades)', 'Decorative Items', 199, 169, 0, 'Bright rangoli powders for festive decoration.'],
];

(async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to create dummy users with a known password in production.');
    process.exit(1);
  }
  await connectDB();
  const pw = await bcrypt.hash(DUMMY_PASSWORD, 12);

  let u = 0;
  for (const [name, email, phone] of USERS) {
    if (!(await User.exists({ email }))) { await User.create({ name, email, phone, password: pw, role: 'USER' }); u++; }
  }

  const pujas = {};
  (await Puja.find()).forEach((p) => (pujas[p.name] = p._id));
  let pn = 0;
  for (const [name, experience, languages, city, state, priceFrom, specs] of PANDITS) {
    if (await Pandit.exists({ name })) continue;
    await Pandit.create({
      name, experience, languages, city, state, location: `${city}, ${state}`, priceFrom, specializations: specs,
      services: specs.map((s) => pujas[s]).filter(Boolean),
      bio: `${name} has ${experience} years of experience performing Vedic rituals with devotion and precision, and explains each step of the Puja to the family.`,
      rating: 4.5 + Math.round(Math.random() * 4) / 10, totalReviews: 0, completedPujas: 80 + Math.floor(Math.random() * 400), isVerified: true,
    });
    pn++;
  }

  const cats = {};
  (await Category.find()).forEach((c) => (cats[c.name] = c._id));
  let n = (await Product.countDocuments()) + 1;
  let pr = 0;
  for (const [name, cat, price, discountPrice, stock, description] of PRODUCTS) {
    if (!cats[cat]) { console.log(`Skipping "${name}" — category "${cat}" missing (run npm run seed first)`); continue; }
    if (await Product.exists({ slug: slugify(name) })) continue;
    await Product.create({
      name, slug: slugify(name), sku: `BP-${String(n++).padStart(4, '0')}`, category: cats[cat], price, discountPrice: discountPrice || undefined, stock, description,
      specifications: [{ key: 'Origin', value: 'India' }, { key: 'Quality', value: 'Authentic, temple-grade' }],
      rating: 4 + Math.round(Math.random() * 10) / 10,
    });
    pr++;
  }

  console.log(`Added ${u} users, ${pn} pandits, ${pr} products.`);
  console.log(`Dummy user login: any email above (e.g. rahul@example.com) / ${DUMMY_PASSWORD}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
