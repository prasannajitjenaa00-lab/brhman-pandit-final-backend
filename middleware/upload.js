const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { cloudinary, cloudinaryEnabled } = require('../config/cloudinary');
const { ApiError } = require('../utils/helpers');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PRIVATE_DIR = path.join(__dirname, '..', 'private_uploads');
[UPLOAD_DIR, PRIVATE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

const make = (types, maxMb) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) =>
      types.includes(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Unsupported file type')),
  });

const imageUpload = make(IMAGE_TYPES, 5);
const documentUpload = make(DOC_TYPES, 8);

const extFor = (file) => ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.jpg');

// Public images -> Cloudinary when configured, otherwise local /uploads
async function saveImage(file, folder = 'brahmam-pandit') {
  if (cloudinaryEnabled) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder, resource_type: 'image' }, (err, result) => (err ? reject(err) : resolve(result.secure_url)))
        .end(file.buffer);
    });
  }
  const name = `${crypto.randomBytes(12).toString('hex')}${extFor(file)}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

// Verification documents never go to a public location; admin-only download route serves them.
async function savePrivateDocument(file) {
  const name = `${crypto.randomBytes(16).toString('hex')}${extFor(file)}`;
  await fs.promises.writeFile(path.join(PRIVATE_DIR, name), file.buffer);
  return name;
}

module.exports = { imageUpload, documentUpload, saveImage, savePrivateDocument, PRIVATE_DIR, UPLOAD_DIR };
