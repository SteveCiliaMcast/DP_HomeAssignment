require("../common/config");

const { createServiceApp, registerErrorHandlers } = require("../common/app");
const { getPort, getServiceUrls } = require("../common/config");
const { connectDatabase } = require("../common/database");
const { sendSuccess } = require("../common/responses");
const { startServer } = require("../common/server");

const serviceName = "api-gateway";
const app = createServiceApp(serviceName);
const port = getPort("GATEWAY_PORT", 5100);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Cab Booking Platform API Gateway",
    services: getServiceUrls()
  });
});

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
