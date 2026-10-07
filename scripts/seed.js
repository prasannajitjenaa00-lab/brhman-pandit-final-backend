// Usage: npm run seed   (idempotent for the admin; sample catalog is only created when empty)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Puja = require('../models/Puja');
const Pandit = require('../models/Pandit');
const Setting = require('../models/Setting');
const { slugify } = require('../utils/helpers');

const CATEGORIES = ['Puja Kits', 'Incense', 'Camphor', 'Diyas', 'Kalash', 'Puja Thali', 'Rudraksha', 'Idols', 'Religious Books', 'Havan Samagri', 'Decorative Items'];

// [name, category, price, discountPrice, stock, description]
const PRODUCTS = [
  ['Satyanarayan Puja Kit', 'Puja Kits', 899, 749, 40, 'Complete kit with everything needed for Satyanarayan Katha.'],
  ['Griha Pravesh Puja Kit', 'Puja Kits', 1499, 1299, 25, 'Complete samagri for a traditional Griha Pravesh ceremony.'],
  ['Lakshmi Puja Kit', 'Puja Kits', 799, 649, 30, 'Essential items for Lakshmi Puja and Diwali.'],
  ['Ganesh Puja Kit', 'Puja Kits', 599, 499, 35, 'Everything for a simple, auspicious Ganesh Puja.'],
  ['Sandalwood Incense Sticks (Pack of 12)', 'Incense', 249, 199, 120, 'Hand-rolled sandalwood agarbatti with a calming fragrance.'],
  ['Rose Dhoop Sticks', 'Incense', 149, null, 90, 'Fragrant rose dhoop sticks for daily worship.'],
  ['Pure Camphor Tablets (100 g)', 'Camphor', 129, 109, 150, 'Pure, smokeless camphor for aarti and havan.'],
  ['Brass Diya Set (Set of 4)', 'Diyas', 449, 399, 45, 'Handcrafted brass diyas with a traditional finish.'],
  ['Clay Diya Pack (Pack of 24)', 'Diyas', 199, 169, 3, 'Natural clay diyas for festivals.'],
  ['Copper Kalash with Coconut Stand', 'Kalash', 649, 579, 20, 'Pure copper kalash for Puja and Griha Pravesh.'],
  ['Brass Puja Thali Set', 'Puja Thali', 1299, 1099, 15, 'Premium brass thali set with all accessories.'],
  ['5 Mukhi Rudraksha Mala', 'Rudraksha', 599, 499, 50, '108+1 bead genuine rudraksha mala.'],
  ['Brass Ganesh Idol (6 inch)', 'Idols', 1599, 1399, 12, 'Finely detailed brass Ganesh idol.'],
  ['Shri Hanuman Chalisa (Hindi)', 'Religious Books', 99, null, 80, 'Pocket-size Hanuman Chalisa with meaning.'],
  ['Bhagavad Gita (Hindi)', 'Religious Books', 299, 249, 60, 'Bhagavad Gita with shloka and simple Hindi translation.'],
  ['Havan Samagri (500 g)', 'Havan Samagri', 249, 219, 70, 'Traditional herbal havan samagri blend.'],
  ['Pure Cow Ghee for Puja (500 ml)', 'Havan Samagri', 449, 399, 40, 'Pure desi cow ghee for diya and havan.'],
  ['Cotton Wicks (Pack of 100)', 'Diyas', 79, null, 200, 'Soft hand-rolled cotton batti for diyas.'],
  ['Marigold Artificial Toran', 'Decorative Items', 349, 299, 28, 'Reusable festive door toran.'],
  ['Embroidered Puja Aasan', 'Decorative Items', 299, 249, 0, 'Soft cushioned aasan with traditional embroidery.'],
];

const PUJAS = [
  ['Griha Pravesh Puja', 'Seek blessings and positivity before entering your new home.', 5100, '3–4 hours', ['Brings peace and prosperity to the home', 'Removes negative energy', 'Invokes blessings of the Vastu devtas'], ['Kalash', 'Coconut', 'Mango leaves', 'Havan samagri', 'Rice', 'Turmeric & kumkum']],
  ['Satyanarayan Puja', 'A devotional katha and puja for prosperity and well-being.', 2501, '2–3 hours', ['Brings prosperity and happiness', 'Fulfilment of wishes', 'Family harmony'], ['Satyanarayan kit', 'Banana leaves', 'Panchamrit', 'Tulsi', 'Fruits']],
  ['Ganesh Puja', 'Begin every endeavour by invoking Lord Ganesha.', 1501, '1–2 hours', ['Removes obstacles', 'Success in new beginnings', 'Wisdom and clarity'], ['Ganesh idol', 'Durva grass', 'Modak', 'Red flowers', 'Incense']],
  ['Lakshmi Puja', 'Invoke Goddess Lakshmi for wealth and abundance.', 2101, '1.5–2 hours', ['Wealth and abundance', 'Business growth', 'Family prosperity'], ['Lakshmi idol', 'Lotus flowers', 'Kalash', 'Diyas', 'Sweets']],
  ['Rudrabhishek', 'Sacred abhishek of Lord Shiva with chanting of Rudram.', 3501, '2–3 hours', ['Peace of mind', 'Health and protection', 'Removes planetary doshas'], ['Shivling', 'Milk, curd, honey, ghee', 'Bel patra', 'Gangajal', 'Dhatura']],
  ['Navgraha Puja', 'Pacify the nine planets for balance and harmony.', 4101, '3 hours', ['Reduces malefic planetary effects', 'Career and life balance', 'Mental peace'], ['Navgraha samagri', 'Nine grains', 'Coloured cloth', 'Havan samagri']],
  ['Havan', 'Sacred fire ritual for purification and positive energy.', 2901, '2 hours', ['Purifies the environment', 'Positive vibrations', 'Spiritual growth'], ['Havan kund', 'Havan samagri', 'Ghee', 'Mango wood', 'Camphor']],
  ['Vastu Puja', 'Correct Vastu doshas and harmonise your space.', 3101, '2–3 hours', ['Balances energy of the space', 'Removes Vastu doshas', 'Peace in the household'], ['Kalash', 'Navdhanya', 'Havan samagri', 'Coconut']],
  ['Naamkaran', 'Traditional naming ceremony for your newborn.', 2101, '1.5–2 hours', ['Blessings for the child', 'Auspicious name selection', 'Family celebration'], ['Kalash', 'Rice', 'Turmeric', 'Flowers', 'Sweets']],
  ['Marriage Puja', 'Complete Vedic wedding rituals by experienced Pandits.', 11000, '4–6 hours', ['Sacred Vedic rites', 'Blessed beginning to married life', 'Traditional customs'], ['Mandap items', 'Havan samagri', 'Kalash', 'Garlands', 'Sacred thread']],
];

const PUJA_CATEGORY = { 'Griha Pravesh Puja': 'Home & Family', 'Vastu Puja': 'Home & Family', 'Satyanarayan Puja': 'Home & Family', 'Lakshmi Puja': 'Health & Prosperity', 'Ganesh Puja': 'Health & Prosperity', 'Navgraha Puja': 'Health & Prosperity', 'Marriage Puja': 'Marriage & Life Events', Naamkaran: 'Marriage & Life Events', Rudrabhishek: 'Spiritual & Vedic', Havan: 'Spiritual & Vedic' };

const PANDITS = [
  ['Pt. Ramesh Mishra', 22, ['Hindi', 'Sanskrit', 'Odia'], 'Bhubaneswar', 'Odisha', 2501, ['Griha Pravesh Puja', 'Satyanarayan Puja', 'Vastu Puja']],
  ['Pt. Suresh Sharma', 18, ['Hindi', 'Sanskrit'], 'Delhi', 'Delhi', 3100, ['Rudrabhishek', 'Navgraha Puja', 'Havan']],
  ['Pt. Anil Tripathi', 15, ['Hindi', 'Sanskrit', 'English'], 'Varanasi', 'Uttar Pradesh', 2100, ['Ganesh Puja', 'Lakshmi Puja', 'Naamkaran']],
  ['Pt. Gopal Acharya', 25, ['Odia', 'Sanskrit', 'Hindi'], 'Cuttack', 'Odisha', 2800, ['Marriage Puja', 'Griha Pravesh Puja', 'Satyanarayan Puja']],
  ['Pt. Venkatesh Iyer', 20, ['Tamil', 'Telugu', 'Sanskrit', 'English'], 'Bengaluru', 'Karnataka', 3500, ['Rudrabhishek', 'Havan', 'Vastu Puja']],
  ['Pt. Mahesh Joshi', 12, ['Hindi', 'Marathi', 'Sanskrit'], 'Pune', 'Maharashtra', 2200, ['Ganesh Puja', 'Lakshmi Puja', 'Navgraha Puja']],
];

(async () => {
  await connectDB();

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPass || adminPass.length < 12) {
    console.error('Set SEED_ADMIN_PASSWORD (12+ characters) in .env before seeding.');
    process.exit(1);
  }
  if (!(await User.findOne({ email: adminEmail }))) {
    await User.create({ name: 'Admin', email: adminEmail, password: await bcrypt.hash(adminPass, 12), role: 'ADMIN' });
    console.log(`Admin created: ${adminEmail}`);
  } else console.log('Admin already exists');
  await Setting.get();

  if (await Category.countDocuments()) {
    console.log('Catalog already has data — skipping sample data');
    process.exit(0);
  }

  const cats = {};
  for (const name of CATEGORIES) cats[name] = await Category.create({ name, slug: slugify(name) });

  const products = {};
  let n = 1;
  for (const [name, cat, price, discountPrice, stock, description] of PRODUCTS) {
    products[name] = await Product.create({
      name, slug: slugify(name), sku: `BP-${String(n++).padStart(4, '0')}`, category: cats[cat]._id, price,
      discountPrice: discountPrice || undefined, stock, description,
      specifications: [{ key: 'Origin', value: 'India' }, { key: 'Quality', value: 'Authentic, temple-grade' }],
      rating: 4 + Math.round(Math.random() * 10) / 10, reviewCount: 0,
    });
  }

  const find = (...names) => names.map((x) => Object.values(products).find((p) => p.name.toLowerCase().includes(x.toLowerCase()))?._id).filter(Boolean);
  const kitFor = { 'Satyanarayan Puja': ['Satyanarayan', 'Kalash', 'Incense', 'Camphor', 'Cotton Wicks'], 'Griha Pravesh Puja': ['Griha', 'Kalash', 'Havan', 'Camphor'], 'Ganesh Puja': ['Ganesh', 'Incense', 'Diya'], 'Lakshmi Puja': ['Lakshmi', 'Diya', 'Incense'], Havan: ['Havan Samagri', 'Ghee', 'Camphor'] };

  const pujas = {};
  for (const [name, shortDescription, priceFrom, duration, benefits, requiredSamagri] of PUJAS) {
    pujas[name] = await Puja.create({
      name, slug: slugify(name), category: PUJA_CATEGORY[name] || 'Other Ceremonies', shortDescription, priceFrom, duration, benefits, requiredSamagri,
      description: `${shortDescription} Performed by experienced, verified Pandits according to Vedic tradition, with clear guidance at every step.`,
      languages: ['Hindi', 'Sanskrit', 'Odia', 'English'], locations: ['Bhubaneswar', 'Cuttack', 'Delhi', 'Pune', 'Bengaluru', 'Varanasi'],
      recommendedProducts: find(...(kitFor[name] || ['Incense', 'Camphor', 'Cotton Wicks'])),
    });
  }

  for (const [name, experience, languages, city, state, priceFrom, specs] of PANDITS) {
    await Pandit.create({
      name, experience, languages, city, state, location: `${city}, ${state}`, priceFrom, specializations: specs,
      services: specs.map((s) => pujas[s]?._id).filter(Boolean),
      bio: `${name} has ${experience} years of experience performing Vedic rituals with devotion and precision, and is known for explaining each step of the Puja to the family.`,
      rating: 4.5 + Math.round(Math.random() * 4) / 10, totalReviews: 0, completedPujas: 100 + Math.floor(Math.random() * 400), isVerified: true,
    });
  }

  console.log('Sample categories, products, pujas and pandits created');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
