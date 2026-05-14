const express = require("express");
const axios = require("axios");

const { getEnv } = require("../../../common/config");
const { asyncHandler, sendError, sendSuccess } = require("../../../common/responses");
const { getMissingFields } = require("../../../common/validation");

const router = express.Router();

function normalizeLocation(value) {
  return String(value || "").trim();
}

function getMockFare(startingLocation, endingLocation) {
  const normalizedStart = startingLocation.toLowerCase();
  const normalizedEnd = endingLocation.toLowerCase();
  const routeKey = `${normalizedStart}:${normalizedEnd}`;
  const routeScore = Array.from(routeKey).reduce((total, char) => {
    return total + char.charCodeAt(0);
  }, 0);

  const baseFare = 6;
  const routeComponent = (routeScore % 1200) / 100;
  const fare = Number((baseFare + routeComponent).toFixed(2));

  return {
    fare,
    currency: "EUR",
    source: "fare-service-mock"
  };
}

function getRapidApiConfig() {
  return {
    apiKey: getEnv("RAPIDAPI_KEY"),
    host: getEnv("TAXI_FARE_API_HOST"),
    baseUrl: getEnv("TAXI_FARE_API_BASE_URL")
  };
}

function getCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findFirstNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numberMatch = value.match(/\d+(\.\d+)?/);
    return numberMatch ? Number(numberMatch[0]) : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const number = findFirstNumber(item);
      if (number != null) {
        return number;
      }
    }
  }

  if (value && typeof value === "object") {
    const preferredKeys = [
      "fare",
      "price",
      "total",
      "totalFare",
      "total_fare",
      "estimatedFare",
      "amount",
      "value"
    ];

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const number = findFirstNumber(value[key]);
        if (number != null) {
          return number;
        }
      }
    }

    for (const nestedValue of Object.values(value)) {
      const number = findFirstNumber(nestedValue);
      if (number != null) {
        return number;
      }
    }
  }

  return null;
}

function getTaxiFareFromResponse(data) {
  const fares = data?.journey?.fares;

  if (Array.isArray(fares)) {
    const fare = fares.find((item) => {
      const priceInCents = Number(item?.price_in_cents);
      return Number.isFinite(priceInCents) && priceInCents >= 0;
    });

    if (fare) {
      return Number((Number(fare.price_in_cents) / 100).toFixed(2));
    }
  }

  return findFirstNumber(data);
}

async function getExternalFare(req) {
  const config = getRapidApiConfig();
  const depLat = getCoordinate(req.body.depLat);
  const depLng = getCoordinate(req.body.depLng);
  const arrLat = getCoordinate(req.body.arrLat);
  const arrLng = getCoordinate(req.body.arrLng);

  if (!config.apiKey || !config.host || !config.baseUrl) {
    return null;
  }

  if (depLat == null || depLng == null || arrLat == null || arrLng == null) {
    return null;
  }

  const headers = {
    "X-RapidAPI-Key": config.apiKey,
    "X-RapidAPI-Host": config.host
  };

  const response = await axios.get(`${config.baseUrl}/search-geo`, {
    headers,
    timeout: 20000,
    params: {
      dep_lat: depLat,
      dep_lng: depLng,
      arr_lat: arrLat,
      arr_lng: arrLng
    }
  });

  const fare = getTaxiFareFromResponse(response.data);

  if (!Number.isFinite(fare) || fare < 0) {
    throw new Error("Taxi fare API did not return a usable fare value");
  }

  return {
    fare: Number(fare.toFixed(2)),
    currency: response.data?.currency || response.data?.data?.currency || "EUR",
    source: "rapidapi-taxi-fare",
    upstreamData: response.data
  };
}

router.post(
  "/estimate",
  asyncHandler(async (req, res) => {
    const missingFields = getMissingFields(req.body, [
      "startingLocation",
      "endingLocation"
    ]);

    if (missingFields.length > 0) {
      return sendError(res, 400, "Missing required fields", { missingFields });
    }

    const startingLocation = normalizeLocation(req.body.startingLocation);
    const endingLocation = normalizeLocation(req.body.endingLocation);

    if (!startingLocation || !endingLocation) {
      return sendError(res, 400, "Starting and ending locations cannot be empty");
    }

    if (startingLocation.toLowerCase() === endingLocation.toLowerCase()) {
      return sendError(res, 400, "Starting and ending locations must be different");
    }

    try {
      const externalFare = await getExternalFare(req);

      if (externalFare) {
        return sendSuccess(res, {
          startingLocation,
          endingLocation,
          fare: externalFare.fare,
          currency: externalFare.currency,
          source: externalFare.source
        });
      }
    } catch (error) {
      return sendError(res, 502, "Taxi fare API request failed", {
        message: error.response?.data || error.message
      });
    }

    const mockFare = getMockFare(startingLocation, endingLocation);

    return sendSuccess(res, {
      startingLocation,
      endingLocation,
      fare: mockFare.fare,
      currency: mockFare.currency,
      source: mockFare.source
    });
  })
);

module.exports = router;
