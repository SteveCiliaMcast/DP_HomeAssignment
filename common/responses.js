function sendSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data
  });
}

function sendError(res, statusCode = 500, message = "Internal server error", details = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    details
  });
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = {
  sendSuccess,
  sendError,
  asyncHandler
};
