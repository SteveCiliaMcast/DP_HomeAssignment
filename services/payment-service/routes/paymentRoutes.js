const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const { getServiceUrls } = require("../../../common/config");
const { isDatabaseConnected } = require("../../../common/database");
const { asyncHandler, sendError, sendSuccess } = require("../../../common/responses");
const { getMissingFields } = require("../../../common/validation");
const Payment = require("../models/Payment");

const router = express.Router();

function requireDatabase(req, res, next) {
  if (!isDatabaseConnected()) {
    return sendError(
      res,
      503,
      "Database is not connected. Set MONGODB_URI before using payment endpoints."
    );
  }

  return next();
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function toPublicPayment(payment) {
  return {
    paymentId: payment._id.toString(),
    userId: payment.userId.toString(),
    bookingId: payment.bookingId.toString(),
    cabFare: payment.cabFare,
    cabMultiplier: payment.cabMultiplier,
    daytimeMultiplier: payment.daytimeMultiplier,
    passengersMultiplier: payment.passengersMultiplier,
    discountMultiplier: payment.discountMultiplier,
    totalPrice: payment.totalPrice,
    status: payment.status,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
}

function getCabMultiplier(cabType) {
  const multipliers = {
    Economic: 1,
    Premium: 1.2,
    Executive: 1.4
  };

  return multipliers[cabType] || null;
}

function getDaytimeMultiplier(bookingDateTime) {
  const date = new Date(bookingDateTime);
  const hour = date.getHours();

  if (hour >= 0 && hour < 8) {
    return 1.2;
  }

  return 1;
}

function getPassengersMultiplier(passengers) {
  if (!Number.isInteger(passengers) || passengers < 1) {
    return null;
  }

  if (passengers <= 4) {
    return 1;
  }

  if (passengers <= 8) {
    return 2;
  }

  return null;
}

async function getBooking(bookingId) {
  const { bookingServiceUrl } = getServiceUrls();

  try {
    const response = await axios.get(`${bookingServiceUrl}/bookings/${bookingId}`, {
      timeout: 10000
    });

    return {
      booking: response.data?.data || response.data
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { notFound: true };
    }

    return {
      unavailable: true,
      message: error.response?.data?.message || error.message
    };
  }
}

async function getCustomer(userId) {
  const { customerServiceUrl } = getServiceUrls();

  try {
    const response = await axios.get(`${customerServiceUrl}/customers/${userId}`, {
      timeout: 10000
    });

    return {
      customer: response.data?.data || response.data
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { notFound: true };
    }

    return {
      unavailable: true,
      message: error.response?.data?.message || error.message
    };
  }
}

async function updateBookingStatus(bookingId, status) {
  const { bookingServiceUrl } = getServiceUrls();

  return axios.patch(
    `${bookingServiceUrl}/bookings/${bookingId}/status`,
    { status },
    { timeout: 10000 }
  );
}

async function incrementCustomerBookingCount(userId) {
  const { customerServiceUrl } = getServiceUrls();

  return axios.patch(
    `${customerServiceUrl}/customers/${userId}/booking-count`,
    { incrementBy: 1 },
    { timeout: 10000 }
  );
}

async function createDiscountNotificationIfAvailable(userId) {
  const { customerServiceUrl } = getServiceUrls();

  return axios.post(
    `${customerServiceUrl}/customers/${userId}/notifications/discount`,
    {},
    { timeout: 10000 }
  );
}

function calculatePayment(booking, customer) {
  const cabFare = Number(booking.estimatedFare?.amount);
  const cabMultiplier = getCabMultiplier(booking.cabType);
  const daytimeMultiplier = getDaytimeMultiplier(booking.bookingDateTime);
  const passengersMultiplier = getPassengersMultiplier(Number(booking.passengers));
  const discountMultiplier = customer.discountAvailable ? 0.9 : 1;

  if (!Number.isFinite(cabFare) || cabFare < 0) {
    return { error: "Booking does not have a valid estimated fare" };
  }

  if (cabMultiplier == null) {
    return { error: "Booking has an invalid cab type" };
  }

  if (passengersMultiplier == null) {
    return { error: "Booking has an invalid passenger count" };
  }

  const totalPrice = roundMoney(
    cabFare *
      cabMultiplier *
      daytimeMultiplier *
      passengersMultiplier *
      discountMultiplier
  );

  return {
    cabFare,
    cabMultiplier,
    daytimeMultiplier,
    passengersMultiplier,
    discountMultiplier,
    totalPrice
  };
}

router.use(requireDatabase);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const missingFields = getMissingFields(req.body, ["userId", "bookingId"]);

    if (missingFields.length > 0) {
      return sendError(res, 400, "Missing required fields", { missingFields });
    }

    const userId = String(req.body.userId).trim();
    const bookingId = String(req.body.bookingId).trim();

    if (!isValidObjectId(userId) || !isValidObjectId(bookingId)) {
      return sendError(res, 400, "Invalid user ID or booking ID");
    }

    const existingPayment = await Payment.findOne({ bookingId });

    if (existingPayment) {
      return sendError(res, 409, "This booking has already been paid", {
        payment: toPublicPayment(existingPayment)
      });
    }

    const bookingResult = await getBooking(bookingId);

    if (bookingResult.notFound) {
      return sendError(res, 404, "Booking not found");
    }

    if (bookingResult.unavailable) {
      return sendError(res, 502, "Booking service could not retrieve the booking", {
        message: bookingResult.message
      });
    }

    const booking = bookingResult.booking;

    if (String(booking.userId) !== userId) {
      return sendError(res, 403, "Booking does not belong to this user");
    }

    if (booking.status === "cancelled") {
      return sendError(res, 400, "Cancelled bookings cannot be paid");
    }

    const customerResult = await getCustomer(userId);

    if (customerResult.notFound) {
      return sendError(res, 404, "Customer not found");
    }

    if (customerResult.unavailable) {
      return sendError(res, 502, "Customer service could not retrieve the customer", {
        message: customerResult.message
      });
    }

    const paymentCalculation = calculatePayment(booking, customerResult.customer);

    if (paymentCalculation.error) {
      return sendError(res, 400, paymentCalculation.error);
    }

    const payment = await Payment.create({
      userId,
      bookingId,
      ...paymentCalculation,
      status: "paid"
    });

    try {
      await updateBookingStatus(bookingId, "completed");
      await incrementCustomerBookingCount(userId);
      await createDiscountNotificationIfAvailable(userId);
    } catch (error) {
      return sendError(res, 502, "Payment saved but downstream update failed", {
        payment: toPublicPayment(payment),
        message: error.response?.data?.message || error.message
      });
    }

    return sendSuccess(res, toPublicPayment(payment), 201);
  })
);

router.get(
  "/user/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const payments = await Payment.find({ userId }).sort({ createdAt: -1 });

    return sendSuccess(res, payments.map(toPublicPayment));
  })
);

router.get(
  "/:paymentId",
  asyncHandler(async (req, res) => {
    const { paymentId } = req.params;

    if (!isValidObjectId(paymentId)) {
      return sendError(res, 400, "Invalid payment ID");
    }

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return sendError(res, 404, "Payment not found");
    }

    return sendSuccess(res, toPublicPayment(payment));
  })
);

module.exports = router;
