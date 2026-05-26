require("../../common/config");

const { createServiceApp, registerErrorHandlers } = require("../../common/app");
const { getServicePort } = require("../../common/config");
const { connectDatabase } = require("../../common/database");
const { sendSuccess } = require("../../common/responses");
const { startServer } = require("../../common/server");
const paymentRoutes = require("./routes/paymentRoutes");

const serviceName = "payment-service";
const app = createServiceApp(serviceName);
const port = getServicePort("PAYMENT_SERVICE_PORT", 5103);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Payment service is ready"
  });
});

app.use("/payments", paymentRoutes);

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
