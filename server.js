/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║           LUNEVIA AGATES — PRODUCTION BACKEND              ║
 * ║         Node.js + Express + MongoDB + JWT + Razorpay       ║
 * ╚════════════════════════════════════════════════════════════╝
 */

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const connectDB = require("./config/db");
const logger = require("./utils/logger");
const mongoose = require("mongoose");
const Product = require("./models/Product");
const Category = require("./models/Category");
const Settings = require("./models/Settings");
const { apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFound } = require("./middleware/errorHandler");

// ── Active Showcase & Catalog Routes ─────────────────────────
const authRoutes     = require("./routes/authRoutes");
const productRoutes  = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const adminRoutes    = require("./routes/adminRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

// ── Ensure directories exist (local persistent environments only) ─────────
if (!process.env.VERCEL) {
  try {
    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const uploadsDir = path.join(__dirname, "uploads/products");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  } catch {
    // Read-only filesystem fallback
  }
}

// ── Initialize Express ────────────────────────────────────────
const app = express();

// ════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ════════════════════════════════════════════════════════════

// 1. Secure HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS — whitelist frontend origins
const customOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((u) => u.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  ...customOrigins,
  "https://www.shoplunévia.com",
  "https://shoplunévia.com",
  "https://www.xn--shoplunvia-h7a.com",
  "https://xn--shoplunvia-h7a.com",
  "https://luneviashop.vercel.app",
  "https://lunevia-fe.vercel.app",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, SSR, same-origin)
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes(cleanOrigin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      callback(new Error(`CORS policy blocked: ${origin}`));
    },
    credentials: true, // Allow cookies (refresh token)
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-admin-passcode",
      "x-admin-pin",
      "x-admin-session",
    ],
  })
);

// 3. Trust proxy (for accurate IP in rate limiting behind nginx/load balancer)
app.set("trust proxy", 1);

// 4. Global rate limiter
app.use("/api", apiLimiter);

// ════════════════════════════════════════════════════════════
// BODY PARSING
// ════════════════════════════════════════════════════════════
app.use(express.json({ limit: "10kb" }));           // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ════════════════════════════════════════════════════════════
// DATA SANITIZATION
// ════════════════════════════════════════════════════════════

// 5. NoSQL injection prevention (strips $ and . from req.body/params/query)
app.use(mongoSanitize());

// 6. XSS attack prevention (sanitize HTML in inputs)
app.use(xss());

// 7. HTTP Parameter Pollution prevention
app.use(
  hpp({
    whitelist: ["price", "category", "sort", "page", "limit"], // Allow array versions of these
  })
);

// ════════════════════════════════════════════════════════════
// LOGGING
// ════════════════════════════════════════════════════════════
if (process.env.NODE_ENV === "development" || process.env.VERCEL) {
  app.use(morgan("dev"));
} else {
  try {
    const logsDir = path.join(__dirname, "logs");
    const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), { flags: "a" });
    app.use(morgan("combined", { stream: accessLogStream }));
  } catch {
    app.use(morgan("dev"));
  }
}

// ════════════════════════════════════════════════════════════
// DATABASE CONNECTION MIDDLEWARE (ensures MongoDB is ready on serverless)
// ════════════════════════════════════════════════════════════
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
  } catch {
    // proceed to let routes handle offline/fallback modes
  }
  next();
});

// ════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ════════════════════════════════════════════════════════════
// API ROUTES (Showcase, Catalog & Settings)
// ════════════════════════════════════════════════════════════
app.use("/api/auth",       authRoutes);
app.use("/api/products",   productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/admin",      adminRoutes);
app.use("/api/settings",   settingsRoutes);

// Bootstrap Endpoint: combines products, categories, and homepage settings in 1 request
app.get("/api/bootstrap", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ products: [], categories: [], homepageConfig: null });
    }
    const [dbProducts, dbCategories, dbSettings] = await Promise.all([
      Product.find({ isActive: true })
        .populate("category", "name slug")
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Category.find({ isActive: true }).sort({ name: 1 }).lean(),
      Settings.findOne({ key: "homepage" }).lean(),
    ]);

    if (process.env.NODE_ENV === "production") {
      res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    } else {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }

    return res.json({
      products: dbProducts || [],
      categories: dbCategories || [],
      homepageConfig: dbSettings?.value || null,
    });
  } catch {
    return res.json({ products: [], categories: [], homepageConfig: null });
  }
});

// ════════════════════════════════════════════════════════════
// SEO: SITEMAP & ROBOTS.TXT
// ════════════════════════════════════════════════════════════
app.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
    let products = [];
    if (mongoose.connection.readyState === 1) {
      products = await Product.find({ isActive: true }).select("_id slug updatedAt").lean();
    }
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/shop</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/contact</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    for (const p of products) {
      const idOrSlug = p.slug || p._id;
      const modDate = p.updatedAt ? new Date(p.updatedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      xml += `  <url><loc>${baseUrl}/product/${idOrSlug}</loc><lastmod>${modDate}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
    }
    xml += `</urlset>`;
    res.header("Content-Type", "application/xml");
    return res.send(xml);
  } catch {
    res.status(500).send("Error generating sitemap");
  }
});

app.get("/robots.txt", (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
  res.type("text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /catalog-admin\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

// ════════════════════════════════════════════════════════════
// FRONTEND SERVING & FULL SERVER-SIDE RENDERING (SSR)
// ════════════════════════════════════════════════════════════
let frontendDistPath = path.join(__dirname, "../frontend/dist/client");
if (!fs.existsSync(frontendDistPath)) {
  frontendDistPath = path.join(__dirname, "../frontend/dist");
}
const serverEntryPath = path.join(__dirname, "../frontend/dist/server/entry-server.js");

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath, { index: false }));

  app.get("*", async (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();

    const indexPath = path.join(frontendDistPath, "index.html");
    if (!fs.existsSync(indexPath)) return next();

    try {
      let html = fs.readFileSync(indexPath, "utf8");
      const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
      const currentUrl = `${baseUrl}${req.originalUrl}`;

      let pageTitle = "LUNÉVIA — Curated Natural Agate & Mineral Specimens";
      let pageDesc = "Nature's Artistry, Refined — Discover rare, ethically sourced agate slices, amethyst geodes, and natural mineral specimens for luxury collectors.";
      let pageImage = `${baseUrl}/hero-agate.webp`;
      let pageType = "website";
      let jsonLd = null;
      let isNoIndex = req.path.startsWith("/catalog-admin");

      // Pre-fetch live database data for SSR and Hydration
      let initialData = { products: [], categories: [], homepageConfig: null };
      if (mongoose.connection.readyState === 1) {
        try {
          const [dbProducts, dbCategories, dbSettings] = await Promise.all([
            Product.find({ isActive: true }).populate("category", "name slug").lean(),
            Category.find({ isActive: true }).sort({ name: 1 }).lean(),
            Settings.findOne({ key: "homepage_layout" }).lean(),
          ]);

          initialData.products = (dbProducts || []).map((p) => ({
            id: String(p._id),
            name: p.name,
            price: p.price || 0,
            category: p.category?.name || "Specimen",
            description: p.description || "",
            image: (p.images && p.images[0]?.url) || "/placeholder.svg",
            featured: Boolean(p.featured),
          }));

          initialData.categories = (dbCategories || []).map((c) => c.name).filter(Boolean);
          if (dbSettings?.value) {
            initialData.homepageConfig = dbSettings.value;
          }
        } catch {
          // ignore
        }
      }

      const productMatch = req.path.match(/^\/product\/([a-zA-Z0-9_-]+)/);
      if (productMatch && mongoose.connection.readyState === 1) {
        const idOrSlug = productMatch[1];
        const query = mongoose.Types.ObjectId.isValid(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
        const product = await Product.findOne(query).populate("category", "name").lean();
        if (product) {
          const catName = product.category?.name || "Specimen";
          pageTitle = `${product.name} — ${catName} | LUNÉVIA`;
          pageDesc = product.description || `Exquisite natural ${product.name} specimen. Ethically sourced and handcrafted agate & mineral gemstone.`;
          if (product.images && product.images[0]?.url) {
            pageImage = product.images[0].url;
          }
          pageType = "product";
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            category: catName,
            image: [pageImage],
            description: pageDesc,
            brand: { "@type": "Brand", name: "LUNÉVIA" },
            offers: {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              price: product.price || "0",
              priceCurrency: "USD",
              url: currentUrl,
              seller: { "@type": "Organization", name: "LUNÉVIA" },
            },
          };
        }
      } else if (req.path === "/shop") {
        pageTitle = "Curated Specimen Catalogue | LUNÉVIA";
        pageDesc = "Browse LUNÉVIA's curated collection of natural agate slices, amethyst geodes, and rare mineral specimens.";
      } else if (req.path === "/about") {
        pageTitle = "Our Story & Geological Heritage | LUNÉVIA";
        pageDesc = "Learn about LUNÉVIA's mission, ethical sourcing practices, and the geological mastery behind our handcrafted agate collection.";
      } else if (req.path === "/contact") {
        pageTitle = "Contact Our Gemologist Concierge | LUNÉVIA";
        pageDesc = "Inquire about custom gemstone curations, specimen sourcing, and worldwide delivery. Connect with the LUNÉVIA showroom.";
      }

      // Execute full Server-Side Rendering (SSR) if entry-server bundle exists
      let appHtml = "";
      if (fs.existsSync(serverEntryPath)) {
        try {
          const { render } = require(serverEntryPath);
          appHtml = render(req.originalUrl, initialData);
        } catch (ssrErr) {
          logger.error(`SSR render error: ${ssrErr.message}`);
        }
      }

      const escapeHtml = (str) =>
        String(str || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

      const seoTags = [
        `<title>${escapeHtml(pageTitle)}</title>`,
        `<meta name="description" content="${escapeHtml(pageDesc)}" />`,
        `<meta name="robots" content="${isNoIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
        `<link rel="canonical" href="${escapeHtml(currentUrl)}" />`,
        `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
        `<meta property="og:description" content="${escapeHtml(pageDesc)}" />`,
        `<meta property="og:image" content="${escapeHtml(pageImage)}" />`,
        `<meta property="og:url" content="${escapeHtml(currentUrl)}" />`,
        `<meta property="og:type" content="${escapeHtml(pageType)}" />`,
        `<meta property="og:site_name" content="LUNÉVIA" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(pageDesc)}" />`,
        `<meta name="twitter:image" content="${escapeHtml(pageImage)}" />`,
      ];
      if (jsonLd) {
        seoTags.push(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`);
      }

      // Inject rendered markup into #root
      if (appHtml) {
        html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
      }

      // Inject initialData for client hydration
      const stateScript = `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, "\\u003c")};</script>`;
      seoTags.push(stateScript);

      html = html.replace(/<title>.*?<\/title>/i, "");
      html = html.replace("<head>", `<head>\n    ${seoTags.join("\n    ")}`);

      return res.send(html);
    } catch {
      return res.sendFile(indexPath);
    }
  });
}

// ════════════════════════════════════════════════════════════
// ERROR HANDLING (always last)
// ════════════════════════════════════════════════════════════
app.use(notFound);
app.use(errorHandler);

// ════════════════════════════════════════════════════════════
// START SERVER (only when executed directly, not when required in serverless)
// ════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;
let server;

if (require.main === module && !process.env.VERCEL) {
  server = app.listen(PORT, () => {
    logger.info(`🚀 Lunevia backend running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
}

// ── Unhandled rejections / exceptions ────────────────────────
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  if (process.env.NODE_ENV === "production" && server) {
    server.close(() => process.exit(1));
  }
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  if (!process.env.VERCEL) {
    process.exit(1);
  }
});

module.exports = app;
