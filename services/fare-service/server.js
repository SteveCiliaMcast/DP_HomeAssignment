require("../../common/config");

const { createServiceApp, registerErrorHandlers } = require("../../common/app");
const { getPort } = require("../../common/config");
const { connectDatabase } = require("../../common/database");
const { sendSuccess } = require("../../common/responses");
const { startServer } = require("../../common/server");
const fareRoutes = require("./routes/fareRoutes");

const serviceName = "fare-service";
const app = createServiceApp(serviceName);
const port = getPort("FARE_SERVICE_PORT", 5104);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Fare estimation service is ready"
  });
});

app.use("/fares", fareRoutes);

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
