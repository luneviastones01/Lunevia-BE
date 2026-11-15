const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const escapeXml = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * GET /api/feed/google-shopping.xml
 * Google Merchant Center & Google Images Free Listings XML RSS Feed
 */
router.get("/google-shopping.xml", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    const baseUrl = "https://www.xn--shoplunvia-h7a.com";
    const products =
      mongoose.connection.readyState === 1
        ? await Product.find({ isActive: true }).populate("category", "name").lean()
        : [];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>LUNÉVIA — Curated Natural Agate &amp; Gemstone Products</title>\n`;
    xml += `    <link>${baseUrl}</link>\n`;
    xml += `    <description>Luxury natural agate slices, crystalline geodes, and rare mineral gemstone products.</description>\n`;

    for (const p of products) {
      const idOrSlug = p.slug || p._id;
      const link = `${baseUrl}/product/${idOrSlug}`;
      const primaryImage = (p.images && p.images[0]?.url) || "";
      const priceVal = p.price && p.price > 0 ? `${p.price}.00 USD` : "0.00 USD";
      const catName = p.category?.name || "Natural Gemstone";

      xml += `    <item>\n`;
      xml += `      <g:id>${escapeXml(String(p._id))}</g:id>\n`;
      xml += `      <g:title>${escapeXml(p.name)}</g:title>\n`;
      xml += `      <g:description>${escapeXml(
        p.description || `${p.name} — Handcrafted natural ${catName} by LUNÉVIA.`
      )}</g:description>\n`;
      xml += `      <g:link>${link}</g:link>\n`;
      if (primaryImage) {
        xml += `      <g:image_link>${escapeXml(primaryImage)}</g:image_link>\n`;
      }
      xml += `      <g:availability>in_stock</g:availability>\n`;
      xml += `      <g:price>${priceVal}</g:price>\n`;
      xml += `      <g:brand>LUNÉVIA</g:brand>\n`;
      xml += `      <g:condition>new</g:condition>\n`;
      xml += `      <g:product_type>${escapeXml(catName)}</g:product_type>\n`;
      xml += `    </item>\n`;
    }

    xml += `  </channel>\n`;
    xml += `</rss>`;

    res.header("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.send(xml);
  } catch {
    return res.status(500).send("Error generating Google Shopping feed");
  }
});

module.exports = router;
