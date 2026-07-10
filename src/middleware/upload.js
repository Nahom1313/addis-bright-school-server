import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary — credentials come from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'school-platform/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }],
    // Use a random public_id so filenames don't collide
    public_id: (_req, file) => {
      const name = file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '_');
      return `${name}_${Date.now()}`;
    },
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG and WebP images are allowed.'));
  }
};

export const uploadProfile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB (Cloudinary compresses anyway)
}).single('profilePicture');

export const handleUpload = (req, res, next) => {
  uploadProfile(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    // Cloudinary stores the full URL in req.file.path
    // Normalise: if a file was uploaded, set req.file.filename to the full URL
    if (req.file) req.file.filename = req.file.path;
    next();
  });
};

export { cloudinary };

// ─── Payment screenshots ───────────────────────────────────────────
// Stored on Cloudinary under a separate folder. PDF receipts are also
// accepted since some banks email a PDF instead of a screenshot.
const paymentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'school-platform/payments',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    resource_type:   'auto',
    public_id: (_req, file) => {
      const name = file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '_');
      return `${name}_${Date.now()}`;
    },
  },
});

const uploadPaymentRaw = multer({
  storage: paymentStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    if (allowed.test(file.mimetype) || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only JPEG, PNG, WebP, or PDF files are allowed.'));
  },
}).single('screenshot');

export const handlePaymentUpload = (req, res, next) => {
  uploadPaymentRaw(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (req.file) req.file.filename = req.file.path; // normalise to full URL
    next();
  });
};
