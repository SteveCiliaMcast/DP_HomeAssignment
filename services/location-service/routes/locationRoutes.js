const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const { getEnv, getServiceUrls } = require("../../../common/config");
const { isDatabaseConnected } = require("../../../common/database");
const { asyncHandler, sendError, sendSuccess } = require("../../../common/responses");
const { getMissingFields } = require("../../../common/validation");
const FavouriteLocation = require("../models/FavouriteLocation");

const router = express.Router();

function requireDatabase(req, res, next) {
  if (!isDatabaseConnected()) {
    return sendError(
      res,
      503,
      "Database is not connected. Set MONGODB_URI before using location endpoints."
    );
  }

  return next();
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function getCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLocationInput(body) {
  return {
    userId: String(body.userId || "").trim(),
    label: String(body.label || "").trim(),
    address: String(body.address || "").trim(),
    latitude: getCoordinate(body.latitude),
    longitude: getCoordinate(body.longitude)
  };
}

function validateLocationInput(input, requireUserId = true) {
  const missingFields = [];

  if (requireUserId && !input.userId) {
    missingFields.push("userId");
  }

  if (!input.label) {
    missingFields.push("label");
  }

  if (!input.address) {
    missingFields.push("address");
  }

  if (input.latitude == null) {
    missingFields.push("latitude");
  }

  if (input.longitude == null) {
    missingFields.push("longitude");
  }

  if (missingFields.length > 0) {
    return { message: "Missing required fields", details: { missingFields } };
  }

  if (requireUserId && !isValidObjectId(input.userId)) {
    return { message: "Invalid user ID" };
  }

  if (input.latitude < -90 || input.latitude > 90) {
    return { message: "latitude must be between -90 and 90" };
  }

  if (input.longitude < -180 || input.longitude > 180) {
    return { message: "longitude must be between -180 and 180" };
  }

  return null;
}

function toPublicLocation(location) {
  return {
    locationId: location._id.toString(),
    userId: location.userId.toString(),
    label: location.label,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt
  };
}

async function ensureCustomerExists(userId) {
  const { customerServiceUrl } = getServiceUrls();

  try {
    await axios.get(`${customerServiceUrl}/customers/${userId}`, {
      timeout: 10000
    });
    return { exists: true };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { exists: false };
    }

    return {
      exists: false,
      unavailable: true,
      message: error.response?.data?.message || error.message
    };
  }
}

function getMockWeather(location) {
  const temperature = Number((20 + Math.abs(location.latitude % 8)).toFixed(1));

  return {
    locationId: location._id.toString(),
    label: location.label,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    source: "location-service-mock",
    current: {
      temperatureC: temperature,
      condition: "Partly cloudy",
      windKph: 12,
      humidity: 65
    },
    forecast: [
      {
        date: new Date().toISOString().slice(0, 10),
        minTempC: Number((temperature - 3).toFixed(1)),
        maxTempC: Number((temperature + 3).toFixed(1)),
        condition: "Partly cloudy"
      }
    ]
  };
}

function getWeatherApiConfig() {
  return {
    apiKey: getEnv("RAPIDAPI_KEY"),
    host: getEnv("WEATHER_API_HOST"),
    baseUrl: getEnv("WEATHER_API_BASE_URL")
  };
}

function mapWeatherResponse(location, data) {
  const current = data?.current || {};
  const forecastDay = data?.forecast?.forecastday?.[0] || {};
  const day = forecastDay.day || {};

  return {
    locationId: location._id.toString(),
    label: location.label,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    source: "rapidapi-weatherapi",
    current: {
      temperatureC: current.temp_c ?? null,
      condition: current.condition?.text || null,
      windKph: current.wind_kph ?? null,
      humidity: current.humidity ?? null
    },
    forecast: [
      {
        date: forecastDay.date || null,
        minTempC: day.mintemp_c ?? null,
        maxTempC: day.maxtemp_c ?? null,
        condition: day.condition?.text || null
      }
    ]
  };
}

async function getExternalWeather(location) {
  const config = getWeatherApiConfig();

  if (!config.apiKey || !config.host || !config.baseUrl) {
    return null;
  }

  const response = await axios.get(`${config.baseUrl}/forecast.json`, {
    headers: {
      "X-RapidAPI-Key": config.apiKey,
      "X-RapidAPI-Host": config.host
    },
    timeout: 20000,
    params: {
      q: `${location.latitude},${location.longitude}`,
      days: 1
    }
  });

  return mapWeatherResponse(location, response.data);
}

router.use(requireDatabase);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = normalizeLocationInput(req.body);
    const validationError = validateLocationInput(input);

    if (validationError) {
      return sendError(res, 400, validationError.message, validationError.details || null);
    }

    const customerResult = await ensureCustomerExists(input.userId);

    if (!customerResult.exists) {
      if (customerResult.unavailable) {
        return sendError(res, 502, "Customer service could not validate the user", {
          message: customerResult.message
        });
      }

      return sendError(res, 404, "Customer was not found");
    }

    const location = await FavouriteLocation.create(input);

    return sendSuccess(res, toPublicLocation(location), 201);
  })
);

router.get(
  "/user/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const locations = await FavouriteLocation.find({ userId }).sort({ createdAt: -1 });

    return sendSuccess(res, locations.map(toPublicLocation));
  })
);

router.put(
  "/:locationId",
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;

    if (!isValidObjectId(locationId)) {
      return sendError(res, 400, "Invalid location ID");
    }

    const input = normalizeLocationInput(req.body);
    const validationError = validateLocationInput(input, false);

    if (validationError) {
      return sendError(res, 400, validationError.message, validationError.details || null);
    }

    const location = await FavouriteLocation.findByIdAndUpdate(
      locationId,
      {
        label: input.label,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude
      },
      { new: true, runValidators: true }
    );

    if (!location) {
      return sendError(res, 404, "Favourite location not found");
    }

    return sendSuccess(res, toPublicLocation(location));
  })
);

router.delete(
  "/:locationId",
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;

    if (!isValidObjectId(locationId)) {
      return sendError(res, 400, "Invalid location ID");
    }

    const location = await FavouriteLocation.findByIdAndDelete(locationId);

    if (!location) {
      return sendError(res, 404, "Favourite location not found");
    }

    return sendSuccess(res, {
      deleted: true,
      location: toPublicLocation(location)
    });
  })
);

router.get(
  "/:locationId/weather",
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;

    if (!isValidObjectId(locationId)) {
      return sendError(res, 400, "Invalid location ID");
    }

    const location = await FavouriteLocation.findById(locationId);

    if (!location) {
      return sendError(res, 404, "Favourite location not found");
    }

    try {
      const weather = await getExternalWeather(location);

      if (weather) {
        return sendSuccess(res, weather);
      }
    } catch (error) {
      return sendError(res, 502, "Weather API request failed", {
        message: error.response?.data || error.message
      });
    }

    return sendSuccess(res, getMockWeather(location));
  })
);

module.exports = router;
