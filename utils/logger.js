const winston = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const isVercel = Boolean(process.env.VERCEL);

const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), logFormat),
    silent: process.env.NODE_ENV === "test",
  }),
];

if (!isVercel) {
  transports.push(
    new winston.transports.File({
      filename: path.join("logs", "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join("logs", "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const exceptionHandlers = isVercel
  ? [new winston.transports.Console()]
  : [new winston.transports.File({ filename: path.join("logs", "exceptions.log") })];

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "warn" : "debug",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports,
  exceptionHandlers,
});

module.exports = logger;
