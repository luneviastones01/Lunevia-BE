const { validationResult } = require("express-validator");
const { errorResponse } = require("../utils/apiResponse");

/**
 * Run after express-validator chains.
 * Collects all errors and returns a 422 if any exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    return errorResponse(res, "Validation failed", 422, formatted);
  }
  next();
};

module.exports = { validate };
