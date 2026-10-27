const cloudinary = require("cloudinary").v2;
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== "your_cloud_name" &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY !== "your_api_key" &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_API_SECRET !== "your_api_secret"
);

// Memory storage: Keeps uploaded image buffer in RAM (never writes to local disk)
const storage = multer.memoryStorage();

// Multer upload middleware
const uploadProductImage = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"), false);
    }
  },
});

// Helper: Stream image buffer directly to Cloudinary
const uploadBufferToCloudinary = (fileBuffer, originalname = "image") => {
  return new Promise((resolve) => {
    if (!isCloudinaryConfigured) return resolve(null);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "lunevia/products",
        transformation: [{ width: 1400, height: 1400, crop: "limit", quality: "auto" }],
      },
      (error, result) => {
        if (error) {
          console.error(`Cloudinary stream upload failed: ${error.message}`);
          return resolve(null);
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    uploadStream.end(fileBuffer);
  });
};

module.exports = {
  cloudinary,
  uploadProductImage,
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
};
