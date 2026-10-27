const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  // Prevent long 10s buffering timeouts when offline
  mongoose.set("bufferCommands", false);

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Graceful shutdown (only for persistent server processes)
    if (!process.env.VERCEL) {
      process.on("SIGINT", async () => {
        await mongoose.connection.close();
        logger.info("MongoDB disconnected on app termination");
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
      process.exit(1);
    } else {
      logger.warn("⚠️ Running backend in offline/fallback mode (MongoDB unavailable). Connect MongoDB to persist data.");
    }
  }
};

module.exports = connectDB;
