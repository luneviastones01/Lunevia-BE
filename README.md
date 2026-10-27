# Lunevia Agates — Backend API

Production-ready Node.js/Express backend for the Lunevia Agates luxury e-commerce platform.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MONGO_URI, JWT secrets, Cloudinary, Razorpay keys

# 3. Start development server
npm run dev

# 4. Start production server
npm start
```

---

## Folder Structure

```
lunevia-backend/
├── config/
│   ├── db.js              # MongoDB connection
│   ├── cloudinary.js      # Image upload config + multer
│   └── passport.js        # Google OAuth strategy
├── controllers/
│   ├── authController.js  # Signup, login, refresh, logout, Google OAuth
│   ├── userController.js  # Profile, password change, wishlist
│   ├── productController.js
│   ├── categoryController.js
│   ├── orderController.js
│   ├── paymentController.js  # Razorpay create/verify/webhook
│   └── adminController.js    # Dashboard stats, revenue
├── middleware/
│   ├── auth.js            # protect(), restrictTo(), optionalAuth()
│   ├── rateLimiter.js     # apiLimiter, authLimiter, uploadLimiter
│   ├── validate.js        # express-validator error collector
│   └── errorHandler.js    # Global error + 404 handler
├── models/
│   ├── User.js            # bcrypt, refresh tokens, wishlist, soft-delete
│   ├── Category.js        # Auto-slug
│   ├── Product.js         # Full-text index, virtuals, auto-slug
│   └── Order.js           # Status history, Razorpay fields
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── productRoutes.js
│   ├── categoryRoutes.js
│   ├── orderRoutes.js
│   ├── paymentRoutes.js
│   └── adminRoutes.js
├── utils/
│   ├── logger.js          # Winston file + console logging
│   ├── jwt.js             # Token generation, cookie helpers
│   ├── apiResponse.js     # Standardized response helpers
│   └── paginate.js        # Pagination utilities
├── logs/                  # Auto-created at runtime
├── .env.example
├── .gitignore
├── package.json
└── server.js              # App entry point
```

---

## API Reference

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/signup` | — | Register new user |
| POST | `/login` | — | Login, returns access token |
| POST | `/refresh` | Cookie | Rotate refresh token |
| POST | `/logout` | Bearer | Invalidate refresh token |
| GET  | `/me` | Bearer | Get current user |
| GET  | `/google` | — | Initiate Google OAuth |
| GET  | `/google/callback` | — | OAuth callback |

### Users — `/api/users`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/profile` | Bearer | Get own profile |
| PATCH | `/profile` | Bearer | Update name/phone/avatar |
| PATCH | `/change-password` | Bearer | Change password |
| GET | `/wishlist` | Bearer | Get wishlist |
| POST | `/wishlist/:productId` | Bearer | Toggle wishlist item |
| DELETE | `/account` | Bearer | Soft-delete own account |

### Products — `/api/products`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | All products (filter, search, paginate) |
| GET | `/:id` | — | Single product (by ID or slug) |
| POST | `/` | Admin | Create product (multipart images) |
| PATCH | `/:id` | Admin | Update product |
| DELETE | `/:id` | Admin | Delete product + Cloudinary images |
| DELETE | `/:id/images/:publicId` | Admin | Delete single image |

**Query params:** `category`, `minPrice`, `maxPrice`, `search`, `featured`, `sort` (newest/price_asc/price_desc/popular), `page`, `limit`

### Categories — `/api/categories`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | All active categories |
| GET | `/:id` | — | Single category |
| POST | `/` | Admin | Create category |
| PATCH | `/:id` | Admin | Update category |
| DELETE | `/:id` | Admin | Delete (blocked if products linked) |

### Orders — `/api/orders`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Bearer | Create order from cart |
| GET | `/` | Bearer | My orders |
| GET | `/:id` | Bearer | Single order |
| GET | `/admin/all` | Admin | All orders |
| GET | `/admin/stats` | Admin | Revenue stats by status |
| PATCH | `/:id/status` | Admin | Update order status |

### Payments — `/api/payment`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/create-order` | Bearer | Create Razorpay order |
| POST | `/verify` | Bearer | Verify payment signature |
| POST | `/webhook` | — (signature) | Razorpay webhook handler |

### Admin — `/api/admin`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboard` | Admin | Stats cards + recent orders |
| GET | `/revenue` | Admin | Revenue by period |
| GET | `/top-products` | Admin | Best selling products |
| GET | `/users` | Admin | All users |
| PATCH | `/users/:id/role` | Admin | Change user role |
| DELETE | `/users/:id` | Admin | Deactivate user |

---

## Security Architecture

| Layer | Implementation |
|-------|---------------|
| Password hashing | bcrypt (cost factor 12) |
| Authentication | JWT access (15m) + refresh (7d) in httpOnly cookie |
| Refresh token rotation | Old token invalidated on every refresh |
| Token reuse detection | All sessions cleared on reuse attempt |
| Role-based access | `restrictTo("admin")` middleware on all admin routes |
| Input validation | express-validator on all input-accepting routes |
| NoSQL injection | express-mongo-sanitize strips `$` and `.` |
| XSS | xss-clean sanitizes HTML in request bodies |
| CSRF | SameSite cookie + CORS origin whitelist |
| Rate limiting | 100 req/15min global; 10 req/15min on auth routes |
| Secure headers | Helmet with strict CSP |
| HTTP Parameter Pollution | hpp middleware |
| File upload safety | MIME type check + 5MB limit + Cloudinary |
| Logging | Winston with rotating files |
| Razorpay webhook | HMAC SHA256 signature verification |

---

## Default Admin Account

To seed an admin, run this once in MongoDB:

```js
db.users.insertOne({
  name: "Admin",
  email: "admin@lunevia.com",
  password: "<bcrypt hash of your password>",
  role: "admin",
  isEmailVerified: true,
  active: true,
  createdAt: new Date()
})
```

Or use the signup endpoint then update role directly in MongoDB Atlas.

---

## Frontend Integration

In your React `AuthContext.tsx`, set:

```ts
const USE_BACKEND = true;
const API_BASE_URL = "http://localhost:5000";
```

Access token goes in `Authorization: Bearer <token>` header.
Refresh token is managed automatically via httpOnly cookie.
