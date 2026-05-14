const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const { getEnv, getServiceUrls } = require("../../../common/config");
const { isDatabaseConnected } = require("../../../common/database");
const { asyncHandler, sendError, sendSuccess } = require("../../../common/responses");
const { getMissingFields } = require("../../../common/validation");
const Booking = require("../models/Booking");

const router = express.Router();
const allowedCabTypes = new Set(["Economic", "Premium", "Executive"]);
const allowedStatuses = new Set(["confirmed", "completed", "cancelled"]);

function requireDatabase(req, res, next) {
  if (!isDatabaseConnected()) {
    return sendError(
      res,
      503,
      "Database is not connected. Set MONGODB_URI before using booking endpoints."
    );
  }

  return next();
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toPublicBooking(booking) {
  return {
    bookingId: booking._id.toString(),
    userId: booking.userId.toString(),
    startingLocation: booking.startingLocation,
    endingLocation: booking.endingLocation,
    bookingDateTime: booking.bookingDateTime,
    passengers: booking.passengers,
    cabType: booking.cabType,
    estimatedFare: booking.estimatedFare,
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
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

function createFallbackFareEstimate(startingLocation, endingLocation) {
  const baseFare = 8;
  const distanceHint = Math.max(
    1,
    Math.abs(String(startingLocation).length - String(endingLocation).length)
  );

  return {
    amount: Number((baseFare + distanceHint * 0.75).toFixed(2)),
    currency: "EUR",
    source: "booking-service-fallback"
  };
}

async function getFareEstimate(startingLocation, endingLocation) {
  const { fareServiceUrl } = getServiceUrls();

  try {
    const response = await axios.post(
      `${fareServiceUrl}/fares/estimate`,
      {
        startingLocation,
        endingLocation
      },
      {
        timeout: 10000
      }
    );

    const fareData = response.data?.data || response.data;
    const amount = Number(fareData.fare ?? fareData.amount ?? fareData.estimatedFare);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Fare service returned an invalid fare");
    }

    return {
      amount,
      currency: fareData.currency || "EUR",
      source: fareData.source || "fare-service"
    };
  } catch (error) {
    return createFallbackFareEstimate(startingLocation, endingLocation);
  }
}

function parseBookingDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getCabReadyDelayMs() {
  const delay = Number(getEnv("CAB_READY_DELAY_MS", 180000));

  if (!Number.isFinite(delay) || delay < 0) {
    return 180000;
  }

  return delay;
}

function scheduleCabReadyNotification(booking) {
  const { customerServiceUrl } = getServiceUrls();
  const delayMs = getCabReadyDelayMs();
  const publicBooking = toPublicBooking(booking);

  setTimeout(async () => {
    try {
      await axios.post(
        `${customerServiceUrl}/customers/${publicBooking.userId}/notifications`,
        {
          type: "CAB_READY",
          title: "Cab ready for pickup",
          message: `Your ${publicBooking.cabType} cab from ${publicBooking.startingLocation} to ${publicBooking.endingLocation} is ready for pickup.`,
          metadata: {
            bookingId: publicBooking.bookingId,
            startingLocation: publicBooking.startingLocation,
            endingLocation: publicBooking.endingLocation,
            bookingDateTime: publicBooking.bookingDateTime,
            passengers: publicBooking.passengers,
            cabType: publicBooking.cabType
          }
        },
        {
          timeout: 10000
        }
      );
    } catch (error) {
      console.error(
        `booking-service: failed to create cab-ready notification for booking ${publicBooking.bookingId} - ${error.message}`
      );
    }
  }, delayMs);
}

router.use(requireDatabase);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const missingFields = getMissingFields(req.body, [
      "userId",
      "startingLocation",
      "endingLocation",
      "bookingDateTime",
      "passengers",
      "cabType"
    ]);

    if (missingFields.length > 0) {
      return sendError(res, 400, "Missing required fields", { missingFields });
    }

    const userId = String(req.body.userId).trim();
    const startingLocation = String(req.body.startingLocation).trim();
    const endingLocation = String(req.body.endingLocation).trim();
    const bookingDateTime = parseBookingDateTime(req.body.bookingDateTime);
    const passengers = Number(req.body.passengers);
    const cabType = String(req.body.cabType).trim();

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    if (!startingLocation || !endingLocation) {
      return sendError(res, 400, "Starting and ending locations cannot be empty");
    }

    if (!bookingDateTime) {
      return sendError(res, 400, "bookingDateTime must be a valid date and time");
    }

    if (!Number.isInteger(passengers) || passengers < 1 || passengers > 8) {
      return sendError(res, 400, "Passengers must be a whole number between 1 and 8");
    }

    if (!allowedCabTypes.has(cabType)) {
      return sendError(res, 400, "cabType must be Economic, Premium, or Executive");
    }

    const customerResult = await ensureCustomerExists(userId);

    if (!customerResult.exists) {
      if (customerResult.unavailable) {
        return sendError(res, 502, "Customer service could not validate the user", {
          message: customerResult.message
        });
      }

      return sendError(res, 404, "Customer was not found");
    }

    const estimatedFare = await getFareEstimate(startingLocation, endingLocation);

    const booking = await Booking.create({
      userId,
      startingLocation,
      endingLocation,
      bookingDateTime,
      passengers,
      cabType,
      estimatedFare
    });

    scheduleCabReadyNotification(booking);

    return sendSuccess(res, toPublicBooking(booking), 201);
  })
);

router.get(
  "/current/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const bookings = await Booking.find({
      userId,
      status: "confirmed",
      bookingDateTime: { $gte: new Date() }
    }).sort({ bookingDateTime: 1 });

    return sendSuccess(res, bookings.map(toPublicBooking));
  })
);

router.get(
  "/past/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const bookings = await Booking.find({
      userId,
      $or: [
        { status: { $in: ["completed", "cancelled"] } },
        { bookingDateTime: { $lt: new Date() } }
      ]
    }).sort({ bookingDateTime: -1 });

    return sendSuccess(res, bookings.map(toPublicBooking));
  })
);

router.get(
  "/:bookingId",
  asyncHandler(async (req, res) => {
    const { bookingId } = req.params;

    if (!isValidObjectId(bookingId)) {
      return sendError(res, 400, "Invalid booking ID");
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return sendError(res, 404, "Booking not found");
    }

    return sendSuccess(res, toPublicBooking(booking));
  })
);

router.patch(
  "/:bookingId/status",
  asyncHandler(async (req, res) => {
    const { bookingId } = req.params;
    const status = String(req.body.status || "").trim();

    if (!isValidObjectId(bookingId)) {
      return sendError(res, 400, "Invalid booking ID");
    }

    if (!allowedStatuses.has(status)) {
      return sendError(res, 400, "status must be confirmed, completed, or cancelled");
    }

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status },
      { new: true, runValidators: true }
    );

    if (!booking) {
      return sendError(res, 404, "Booking not found");
    }

    return sendSuccess(res, toPublicBooking(booking));
  })
);

module.exports = router;
