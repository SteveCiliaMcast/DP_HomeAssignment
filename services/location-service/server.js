require("../../common/config");

const { createServiceApp, registerErrorHandlers } = require("../../common/app");
const { getPort } = require("../../common/config");
const { connectDatabase } = require("../../common/database");
const { sendSuccess } = require("../../common/responses");
const { startServer } = require("../../common/server");

const serviceName = "location-service";
const app = createServiceApp(serviceName);
const port = getPort("LOCATION_SERVICE_PORT", 5105);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Location service is ready"
  });
});

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
