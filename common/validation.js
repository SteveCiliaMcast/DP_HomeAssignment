function getMissingFields(body, requiredFields) {
  return requiredFields.filter((field) => {
    const value = body[field];
    return value == null || value === "";
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

module.exports = {
  getMissingFields,
  isValidEmail
};
