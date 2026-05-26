require("../../common/config");

const { createServiceApp, registerErrorHandlers } = require("../../common/app");
const { getServicePort } = require("../../common/config");
const { connectDatabase } = require("../../common/database");
const { sendSuccess } = require("../../common/responses");
const { startServer } = require("../../common/server");
const customerRoutes = require("./routes/customerRoutes");

const serviceName = "customer-service";
const app = createServiceApp(serviceName);
const port = getServicePort("CUSTOMER_SERVICE_PORT", 5101);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Customer service is ready"
  });
});

app.use("/customers", customerRoutes);

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
