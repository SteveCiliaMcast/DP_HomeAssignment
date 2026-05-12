const mongoose = require("mongoose");
const { getEnv } = require("./config");

const readyStateNames = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting"
};

async function connectDatabase(serviceName) {
  const mongoUri = getEnv("MONGODB_URI");
  const dbName = getEnv("MONGODB_DB_NAME");

  if (!mongoUri) {
    console.log(`${serviceName}: MONGODB_URI not set; database connection skipped`);
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(mongoUri, dbName ? { dbName } : undefined);
    console.log(
      `${serviceName}: MongoDB connected${dbName ? ` to database ${dbName}` : ""}`
    );
    return mongoose.connection;
  } catch (error) {
    console.error(`${serviceName}: MongoDB connection failed - ${error.message}`);
    return null;
  }
}

function getDatabaseStatus() {
  return readyStateNames[mongoose.connection.readyState] || "unknown";
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDatabase,
  getDatabaseStatus,
  isDatabaseConnected
};
