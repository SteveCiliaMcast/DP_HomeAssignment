require("../common/config");

const axios = require("axios");
const { createServiceApp, registerErrorHandlers } = require("../common/app");
const { getServicePort, getServiceUrls } = require("../common/config");
const { connectDatabase } = require("../common/database");
const { asyncHandler, sendError, sendSuccess } = require("../common/responses");
const { startServer } = require("../common/server");

const serviceName = "api-gateway";
const app = createServiceApp(serviceName);
const port = getServicePort("GATEWAY_PORT", 5100);

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Cab Booking Platform API Gateway",
    services: getServiceUrls()
  });
});

function getProxyHeaders(req) {
  const headers = {};

  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }

  return headers;
}

function proxyRequest(method, serviceUrl, pathBuilder) {
  return asyncHandler(async (req, res) => {
    const path = typeof pathBuilder === "function" ? pathBuilder(req) : pathBuilder;

    try {
      const response = await axios({
        method,
        url: `${serviceUrl}${path}`,
        params: req.query,
        data: req.body,
        headers: getProxyHeaders(req),
        timeout: 20000
      });

      return res.status(response.status).json(response.data);
    } catch (error) {
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }

      return sendError(res, 502, "Gateway could not reach downstream service", {
        message: error.message,
        serviceUrl,
        path
      });
    }
  });
}

const {
  customerServiceUrl,
  bookingServiceUrl,
  paymentServiceUrl,
  fareServiceUrl,
  locationServiceUrl
} = getServiceUrls();

app.post(
  "/api/customers/register",
  proxyRequest("post", customerServiceUrl, "/customers/register")
);
app.post(
  "/api/customers/login",
  proxyRequest("post", customerServiceUrl, "/customers/login")
);
app.get(
  "/api/customers/:userId",
  proxyRequest("get", customerServiceUrl, (req) => `/customers/${req.params.userId}`)
);
app.get(
  "/api/customers/:userId/notifications",
  proxyRequest(
    "get",
    customerServiceUrl,
    (req) => `/customers/${req.params.userId}/notifications`
  )
);
app.post(
  "/api/customers/:userId/notifications",
  proxyRequest(
    "post",
    customerServiceUrl,
    (req) => `/customers/${req.params.userId}/notifications`
  )
);
app.patch(
  "/api/customers/:userId/notifications/:notificationId/read",
  proxyRequest(
    "patch",
    customerServiceUrl,
    (req) =>
      `/customers/${req.params.userId}/notifications/${req.params.notificationId}/read`
  )
);

app.post("/api/bookings", proxyRequest("post", bookingServiceUrl, "/bookings"));
app.get(
  "/api/bookings/current/:userId",
  proxyRequest("get", bookingServiceUrl, (req) => `/bookings/current/${req.params.userId}`)
);
app.get(
  "/api/bookings/past/:userId",
  proxyRequest("get", bookingServiceUrl, (req) => `/bookings/past/${req.params.userId}`)
);
app.get(
  "/api/bookings/:bookingId",
  proxyRequest("get", bookingServiceUrl, (req) => `/bookings/${req.params.bookingId}`)
);
app.patch(
  "/api/bookings/:bookingId/status",
  proxyRequest(
    "patch",
    bookingServiceUrl,
    (req) => `/bookings/${req.params.bookingId}/status`
  )
);

app.post("/api/fares/estimate", proxyRequest("post", fareServiceUrl, "/fares/estimate"));

app.post("/api/payments", proxyRequest("post", paymentServiceUrl, "/payments"));
app.get(
  "/api/payments/user/:userId",
  proxyRequest("get", paymentServiceUrl, (req) => `/payments/user/${req.params.userId}`)
);
app.get(
  "/api/payments/:paymentId",
  proxyRequest("get", paymentServiceUrl, (req) => `/payments/${req.params.paymentId}`)
);

app.post("/api/locations", proxyRequest("post", locationServiceUrl, "/locations"));
app.get(
  "/api/locations/user/:userId",
  proxyRequest("get", locationServiceUrl, (req) => `/locations/user/${req.params.userId}`)
);
app.put(
  "/api/locations/:locationId",
  proxyRequest("put", locationServiceUrl, (req) => `/locations/${req.params.locationId}`)
);
app.delete(
  "/api/locations/:locationId",
  proxyRequest("delete", locationServiceUrl, (req) => `/locations/${req.params.locationId}`)
);
app.get(
  "/api/locations/:locationId/weather",
  proxyRequest(
    "get",
    locationServiceUrl,
    (req) => `/locations/${req.params.locationId}/weather`
  )
);

registerErrorHandlers(app);

async function main() {
  await connectDatabase(serviceName);
  startServer(app, serviceName, port);
}

main();
