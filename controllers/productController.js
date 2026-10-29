const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const { cloudinary, uploadBufferToCloudinary } = require("../config/cloudinary");
const { successResponse, errorResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination, buildPaginationMeta } = require("../utils/paginate");
const logger = require("../utils/logger");

// ────────────────────────────────────────────────────────────
// GET /api/products  — public, with filtering/search/pagination
// ────────────────────────────────────────────────────────────
exports.getAllProducts = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return paginatedResponse(res, "Offline mode.", { products: [] }, buildPaginationMeta(0, 1, 10));
    }
    const { page, limit, skip } = getPagination(req.query);
    const { category, minPrice, maxPrice, search, featured, sort } = req.query;

    const query = { isActive: true };

    // Category filter
    if (category) query.category = category;

    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Featured filter
    if (featured === "true") query.featured = true;

    // Full-text search
    if (search) {
      query.$text = { $search: search };
    }

    // Sort options
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { soldCount: -1 },
    };
    const sortQuery = sortMap[sort] || { createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name slug")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    // Cache at Vercel Edge CDN for 60s, stale-while-revalidate for 5 mins
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    return paginatedResponse(
      res,
      "Products fetched.",
      { products },
      buildPaginationMeta(total, page, limit)
    );
  } catch (err) {
    logger.error(`getAllProducts error: ${err.message}`);
    return paginatedResponse(res, "Offline mode.", { products: [] }, buildPaginationMeta(0, 1, 10));
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/products/:id  — public
// ────────────────────────────────────────────────────────────
exports.getProduct = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return errorResponse(res, "Product not found.", 404);
    }
    const product = await Product.findOne({
      $or: [
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
        { slug: req.params.id },
      ],
      isActive: true,
    }).populate("category", "name slug");

    if (!product) return errorResponse(res, "Product not found.", 404);
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return successResponse(res, "Product fetched.", { product });
  } catch (err) {
    return errorResponse(res, "Product not found.", 404);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/admin/products  (admin only)
// ────────────────────────────────────────────────────────────
exports.createProduct = async (req, res) => {
  const { name, description, price, comparePrice, category, stock, featured, tags, weight, image, imageUrl } =
    req.body;

  let categoryId = category;
  if (!mongoose.Types.ObjectId.isValid(category)) {
    let catDoc = await Category.findOne({ name: new RegExp(`^${String(category).trim()}$`, "i") });
    if (!catDoc) {
      catDoc = await Category.create({ name: String(category).trim() });
    }
    categoryId = catDoc._id;
  }

  const images = [];
  if (req.files && req.files.length > 0) {
    for (const f of req.files) {
      // Direct stream upload to Cloudinary (no local disk storage)
      const cloudRes = await uploadBufferToCloudinary(f.buffer, f.originalname);
      if (cloudRes && cloudRes.url) {
        images.push({
          url: cloudRes.url,
          publicId: cloudRes.publicId,
          alt: name,
        });
      }
    }
  }

  // Handle URL-based images if sent (array, newline-separated, or single)
  if (req.body.images) {
    const raw = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    raw.forEach((u) => {
      if (typeof u === "string") {
        u.split(/\r?\n+/).forEach((link) => {
          const trimmed = link.trim();
          if (trimmed.startsWith("http") && !images.some((img) => img.url === trimmed)) {
            images.push({ url: trimmed, alt: name });
          }
        });
      }
    });
  }

  if (image || imageUrl) {
    const single = (image || imageUrl).trim();
    if (single && single.startsWith("http") && !images.some((img) => img.url === single)) {
      images.push({ url: single, alt: name });
    }
  }

  if (images.length === 0) {
    images.push({ url: "/placeholder.svg", alt: name });
  }

  const product = await Product.create({
    name,
    description,
    price,
    comparePrice,
    category: categoryId,
    stock: stock !== undefined ? Number(stock) : 1,
    featured: featured === "true" || featured === true,
    images,
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim())) : [],
    weight,
  });

  await product.populate("category", "name slug");
  return successResponse(res, "Product created.", { product }, 201);
};

// ────────────────────────────────────────────────────────────
// PATCH /api/admin/products/:id  (admin only)
// ────────────────────────────────────────────────────────────
exports.updateProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return errorResponse(res, "Product not found.", 404);

  const allowedFields = [
    "name", "description", "price", "comparePrice",
    "stock", "featured", "tags", "weight", "isActive",
  ];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === "featured") {
        product[field] = req.body[field] === "true" || req.body[field] === true;
      } else {
        product[field] = req.body[field];
      }
    }
  });

  if (req.body.category) {
    let categoryId = req.body.category;
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      let catDoc = await Category.findOne({ name: new RegExp(`^${String(categoryId).trim()}$`, "i") });
      if (!catDoc) {
        catDoc = await Category.create({ name: String(categoryId).trim() });
      }
      categoryId = catDoc._id;
    }
    product.category = categoryId;
  }

  // Update or replace images if provided
  const uploadedImages = [];
  if (req.files && req.files.length > 0) {
    for (const f of req.files) {
      // Direct stream upload to Cloudinary (no local disk storage)
      const cloudRes = await uploadBufferToCloudinary(f.buffer, f.originalname);
      if (cloudRes && cloudRes.url) {
        uploadedImages.push({
          url: cloudRes.url,
          publicId: cloudRes.publicId,
          alt: product.name,
        });
      }
    }
  }

  // Handle URL or existing images (never split by comma because Cloudinary options use commas)
  const urlImages = [];
  if (req.body.images) {
    const raw = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    raw.forEach((u) => {
      if (typeof u === "string") {
        u.split(/\r?\n+/).forEach((link) => {
          const trimmed = link.trim();
          if (trimmed.startsWith("http") && !urlImages.some((img) => img.url === trimmed)) {
            urlImages.push({ url: trimmed, alt: product.name });
          }
        });
      }
    });
  } else if (req.body.image || req.body.imageUrl) {
    const single = (req.body.image || req.body.imageUrl).trim();
    if (single && single.startsWith("http")) urlImages.push({ url: single, alt: product.name });
  }

  const combinedImages = [...urlImages, ...uploadedImages];
  if (combinedImages.length > 0) {
    product.images = combinedImages;
  }

  await product.save();
  await product.populate("category", "name slug");
  return successResponse(res, "Product updated.", { product });
};

// ────────────────────────────────────────────────────────────
// DELETE /api/admin/products/:id  (admin only)
// ────────────────────────────────────────────────────────────
exports.deleteProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return errorResponse(res, "Product not found.", 404);

  // Delete images from Cloudinary
  const deletePromises = product.images
    .filter((img) => img.publicId)
    .map((img) => cloudinary.uploader.destroy(img.publicId));

  await Promise.allSettled(deletePromises);
  await Product.findByIdAndDelete(req.params.id);

  return successResponse(res, "Product deleted.");
};

// ────────────────────────────────────────────────────────────
// DELETE /api/admin/products/:id/images/:publicId  (admin only)
// Remove a single image from a product
// ────────────────────────────────────────────────────────────
exports.deleteProductImage = async (req, res) => {
  const { publicId } = req.params;
  const decodedPublicId = decodeURIComponent(publicId);

  const product = await Product.findById(req.params.id);
  if (!product) return errorResponse(res, "Product not found.", 404);

  const imageIndex = product.images.findIndex((img) => img.publicId === decodedPublicId);
  if (imageIndex === -1) return errorResponse(res, "Image not found.", 404);

  // Prevent deleting the last image
  if (product.images.length === 1) {
    return errorResponse(res, "Cannot delete the only image. Upload a replacement first.", 400);
  }

  try {
    await cloudinary.uploader.destroy(decodedPublicId);
  } catch (err) {
    logger.warn(`Cloudinary delete failed for ${decodedPublicId}: ${err.message}`);
  }

  product.images.splice(imageIndex, 1);
  await product.save();
  return successResponse(res, "Image deleted.", { images: product.images });
};
