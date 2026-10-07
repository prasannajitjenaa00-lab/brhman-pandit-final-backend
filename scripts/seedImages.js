// Usage: npm run seed:images — generates local placeholder SVG artwork for every Puja, Pandit,
// Product and Category that has no image yet, and saves it under backend/uploads.
// Real photos uploaded later from the admin panel simply replace these.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Puja = require('../models/Puja');
const Pandit = require('../models/Pandit');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { slugify } = require('../utils/helpers');

const DIR = path.join(__dirname, '..', 'uploads', 'seed');
fs.mkdirSync(DIR, { recursive: true });

const PALETTES = [
  ['#5b1a2e', '#9a2a4c'], ['#c26e0a', '#f0a02b'], ['#7b1e3a', '#e48a12'], ['#8a4b12', '#d9a441'],
  ['#4a1d3d', '#b04a6e'], ['#9a3412', '#f7b955'], ['#3b2417', '#a0522d'], ['#6b2737', '#e5bd5a'],
];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const wrap = (text, max = 18) => {
  const lines = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
};

const motif = (cx, cy, s) => `
  <g transform="translate(${cx} ${cy}) scale(${s})" opacity="0.95">
    <path d="M-60 40 Q0 90 60 40 Q45 70 0 78 Q-45 70 -60 40Z" fill="#451323"/>
    <path d="M-62 38 Q0 58 62 38 Q0 76 -62 38Z" fill="#e5bd5a"/>
    <path d="M0 32 C-22 4 -15 -22 0 -52 C15 -22 22 4 0 32Z" fill="#ffd27a"/>
    <path d="M0 26 C-9 12 -6 -2 0 -16 C6 -2 9 12 0 26Z" fill="#fffaf1"/>
  </g>`;

function art({ title, w = 800, h = 600, kind }) {
  const [a, b] = PALETTES[hash(title) % PALETTES.length];
  const dots = [...Array(14)].map((_, i) => `<circle cx="${(hash(title + i) % w)}" cy="${(hash(title + 'y' + i) % h)}" r="${2 + (i % 3)}" fill="#f4d98a" opacity=".35"/>`).join('');
  const lines = wrap(title);
  const text = lines.map((l, i) => `<text x="${w / 2}" y="${h * 0.72 + i * 40}" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-weight="700" fill="#fffaf1">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>${dots}
  <circle cx="${w / 2}" cy="${h * 0.38}" r="${h * 0.26}" fill="none" stroke="#f4d98a" stroke-opacity=".5" stroke-width="2" stroke-dasharray="3 9"/>
  ${motif(w / 2, h * 0.38, h / 300)}
  ${kind === 'category' ? '' : text}
</svg>`;
}

function avatar(name) {
  const [a, b] = PALETTES[hash(name) % PALETTES.length];
  const initials = name.replace(/^Pt\.?\s*/i, '').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="200" r="150" fill="none" stroke="#f4d98a" stroke-opacity=".5" stroke-width="3" stroke-dasharray="3 10"/>
  <circle cx="200" cy="155" r="62" fill="#fbe9c8"/>
  <path d="M70 360 Q70 250 200 250 Q330 250 330 360Z" fill="#fbe9c8"/>
  <path d="M138 128 Q200 70 262 128 Q250 100 200 92 Q150 100 138 128Z" fill="#e48a12"/>
  <rect x="170" y="112" width="60" height="7" rx="3" fill="#c26e0a"/>
  <text x="200" y="385" text-anchor="middle" font-family="Georgia,serif" font-size="30" font-weight="700" fill="#fffaf1">${esc(initials)}</text>
</svg>`;
}

const save = (name, svg) => {
  fs.writeFileSync(path.join(DIR, `${name}.svg`), svg);
  return `/uploads/seed/${name}.svg`;
};

(async () => {
  await connectDB();
  const empty = { $or: [{ image: '' }, { image: null }, { image: { $exists: false } }] };
  let n = 0;

  for (const p of await Puja.find(empty)) { p.image = save(`puja-${p.slug}`, art({ title: p.name })); await p.save(); n++; }
  for (const c of await Category.find(empty)) { c.image = save(`cat-${c.slug}`, art({ title: c.name, w: 400, h: 400, kind: 'category' })); await c.save(); n++; }
  for (const p of await Pandit.find({ $or: [{ profileImage: '' }, { profileImage: null }, { profileImage: { $exists: false } }] })) {
    p.profileImage = save(`pandit-${slugify(p.name)}`, avatar(p.name)); await p.save(); n++;
  }
  for (const p of await Product.find({ $or: [{ images: { $size: 0 } }, { images: { $exists: false } }] })) {
    p.images = [save(`product-${p.slug}`, art({ title: p.name, w: 600, h: 600 }))]; await p.save(); n++;
  }
  console.log(`Generated images for ${n} records in backend/uploads/seed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
