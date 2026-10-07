// One-off: aligns 12 featured products (names, prices, taglines, ratings, photos) with the shop design.
// Photos are in uploads/seed. Safe to re-run.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { slugify } = require('../utils/helpers');

// [existing slug, new name, category, tagline, MRP, selling price, rating, reviews]
const ITEMS = [
  ['satyanarayan-puja-kit', 'Satyanarayan Puja Kit', 'Puja Kits', 'Complete 35+ items', 1699, 1299, 4.8, 128],
  ['copper-kalash-with-coconut-stand', 'Brass Kalash', 'Kalash', 'Premium Quality', 470, 399, 4.7, 96],
  ['sandalwood-incense-sticks-pack-of-12', 'Incense Sticks (Pack of 12)', 'Incense', 'Natural Fragrance', 249, 199, 4.6, 84],
  ['pure-camphor-tablets-100-g', 'Camphor (100g)', 'Camphor', 'Pure & Natural', 170, 149, 4.8, 210],
  ['havan-kund-copper', 'Havan Kund (Copper)', 'Havan Samagri', 'Traditional Design', 1340, 1099, 4.7, 63],
  ['brass-diya-set-set-of-4', 'Brass Diya Set (5 pcs)', 'Diyas', 'Premium Finish', 550, 499, 4.6, 90],
  ['5-mukhi-rudraksha-mala', 'Rudraksha Mala (108 beads)', 'Rudraksha', 'Original & Certified', 1011, 789, 4.9, 140],
  ['brass-lakshmi-idol-5-inch', 'Brass Lakshmi Idol (5 inch)', 'Idols', 'Handcrafted', 1410, 1199, 4.8, 75],
  ['brass-puja-thali-set', 'Puja Thali Set', 'Puja Thali', 'Complete Set', 1120, 899, 4.7, 81],
  ['brass-ganesh-idol-6-inch', 'Lord Ganesha Idol (4 inch)', 'Idols', 'Brass with Premium Finish', 970, 799, 4.8, 112],
  [null, 'Haldi Kumkum Set', 'Puja Thali', 'Pure & Natural', 235, 199, 4.6, 54],
  ['tulsi-mala-108-beads', 'Tulsi Mala (108 beads)', 'Rudraksha', 'Original Tulsi Wood', 465, 349, 4.7, 83],
];

(async () => {
  await connectDB();
  const cats = {};
  (await Category.find()).forEach((c) => (cats[c.name] = c._id));
  let sku = (await Product.countDocuments()) + 1;
  let n = 0;

  for (const [oldSlug, name, cat, tagline, price, discountPrice, rating, reviewCount] of ITEMS) {
    const slug = slugify(name);
    let p = (await Product.findOne({ slug })) || (oldSlug && (await Product.findOne({ slug: oldSlug })));
    if (!p) p = new Product({ sku: `BP-${String(sku++).padStart(4, '0')}`, description: `${name} — authentic, quality-checked Puja Samagri.` });
    Object.assign(p, { name, slug, category: cats[cat] || p.category, tagline, price, discountPrice, rating, reviewCount, isActive: true });
    if (p.stock < 10) p.stock = 25 + Math.floor(Math.random() * 40);
    const file = `product-${slug}.jpg`;
    if (fs.existsSync(path.join(__dirname, '..', 'uploads', 'seed', file))) p.images = [`/uploads/seed/${file}`];
    await p.save();
    n++;
  }

  // give every other product a tagline so cards look consistent
  for (const p of await Product.find({ $or: [{ tagline: '' }, { tagline: null }, { tagline: { $exists: false } }] })) {
    p.tagline = (p.description || '').split(/[.—]/)[0].slice(0, 40).trim() || 'Authentic Puja Samagri';
    await p.save();
  }
  console.log('Updated/created', n, 'featured products');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
