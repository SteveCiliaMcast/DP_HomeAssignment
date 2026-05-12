require("../../common/config");

const { createServiceApp, registerErrorHandlers } = require("../../common/app");
const { getPort } = require("../../common/config");
const { connectDatabase } = require("../../common/database");
const { sendSuccess } = require("../../common/responses");
const { startServer } = require("../../common/server");

const serviceName = "payment-service";
const app = createServiceApp(serviceName);
const port = getPort("PAYMENT_SERVICE_PORT", 5103);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Payment service is ready"
  });
});

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
