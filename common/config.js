const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(process.cwd(), ".env")
});

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function getPort(name, fallback) {
  const value = Number(getEnv(name, fallback));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a valid port number`);
  }

  return value;
}

function getServicePort(name, fallback) {
  return getPort(name, getEnv("PORT", fallback));
}

function normalizeServiceUrl(value) {
  if (!value) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `http://${value}`;
}

function getServiceUrls() {
  return {
    customerServiceUrl: normalizeServiceUrl(getEnv("CUSTOMER_SERVICE_URL", "http://localhost:5101")),
    bookingServiceUrl: normalizeServiceUrl(getEnv("BOOKING_SERVICE_URL", "http://localhost:5102")),
    paymentServiceUrl: normalizeServiceUrl(getEnv("PAYMENT_SERVICE_URL", "http://localhost:5103")),
    fareServiceUrl: normalizeServiceUrl(getEnv("FARE_SERVICE_URL", "http://localhost:5104")),
    locationServiceUrl: normalizeServiceUrl(getEnv("LOCATION_SERVICE_URL", "http://localhost:5105"))
  };
}

module.exports = {
  getEnv,
  getPort,
  getServicePort,
  getServiceUrls
};
