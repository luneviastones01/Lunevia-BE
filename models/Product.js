const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [100, "Product name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
      default: "",
    },
    price: {
      type: Number,
      required: false,
      default: 0,
      min: [0, "Price cannot be negative"],
    },
    comparePrice: {
      type: Number,
      min: [0, "Compare price cannot be negative"],
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String }, // Cloudinary public_id for deletion
        alt: { type: String, default: "" },
      },
    ],
    stock: {
      type: Number,
      required: [true, "Stock is required"],
      min: [0, "Stock cannot be negative"],
      default: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    weight: {
      type: Number, // grams
      default: null,
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    soldCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────
productSchema.index({ name: "text", description: "text", tags: "text" }); // Full-text search
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ "images.url": 1 }); // Index product image links

// ── Auto-slug ─────────────────────────────────────────────────
productSchema.pre("save", async function (next) {
  if (!this.isModified("name")) return next();

  let slug = this.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Ensure unique slug
  const existingCount = await mongoose.model("Product").countDocuments({ slug, _id: { $ne: this._id } });
  if (existingCount > 0) slug = `${slug}-${Date.now()}`;

  this.slug = slug;
  next();
});

// ── Virtual: primary image ────────────────────────────────────
productSchema.virtual("image").get(function () {
  return this.images[0]?.url || "";
});

// ── Virtual: inStock ─────────────────────────────────────────
productSchema.virtual("inStock").get(function () {
  return this.stock > 0;
});

module.exports = mongoose.model("Product", productSchema);
