const express = require("express");
const cors = require("cors");
const { getDatabaseStatus } = require("./database");
const { sendError, sendSuccess } = require("./responses");

function createServiceApp(serviceName) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (req, res) => {
    return sendSuccess(res, {
      service: serviceName,
      status: "ok",
      database: getDatabaseStatus(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

function registerErrorHandlers(app) {
  app.use((req, res) => {
    return sendError(res, 404, "Endpoint not found");
  });

  app.use((error, req, res, next) => {
    console.error(error);
    return sendError(res, 500, error.message || "Internal server error");
  });
}

module.exports = {
  createServiceApp,
  registerErrorHandlers
};
