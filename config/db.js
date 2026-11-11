const mongoose = require("mongoose");
const logger = require("../utils/logger");

let cachedPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Only reuse cached promise if connection is actively connecting
  if (cachedPromise && mongoose.connection.readyState === 2) {
    return cachedPromise;
  }

  cachedPromise = null;

  if (!process.env.MONGO_URI) {
    logger.warn("MONGO_URI environment variable is not defined");
    return null;
  }

  cachedPromise = mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    })
    .then((conn) => {
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    })
    .catch((err) => {
      cachedPromise = null;
      logger.error(`MongoDB connection error: ${err.message}`);
      throw err;
    });

  return cachedPromise;
};

module.exports = connectDB;
