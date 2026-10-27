/**
 * Standardised API response helpers
 * Ensures every response follows the same shape:
 * { success, message, data? }
 */

const successResponse = (res, message = "Success", data = null, statusCode = 200) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
};

const errorResponse = (res, message = "Internal Server Error", statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const paginatedResponse = (res, message, data, pagination) => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
};

module.exports = { successResponse, errorResponse, paginatedResponse };
