const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { getEnv } = require("../../../common/config");
const { isDatabaseConnected } = require("../../../common/database");
const { asyncHandler, sendError, sendSuccess } = require("../../../common/responses");
const { getMissingFields, isValidEmail } = require("../../../common/validation");
const Notification = require("../models/Notification");
const User = require("../models/User");

const router = express.Router();

function requireDatabase(req, res, next) {
  if (!isDatabaseConnected()) {
    return sendError(
      res,
      503,
      "Database is not connected. Set MONGODB_URI before using customer endpoints."
    );
  }

  return next();
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toPublicUser(user) {
  return {
    userId: user._id.toString(),
    firstName: user.firstName,
    surname: user.surname,
    email: user.email,
    discountAvailable: user.discountAvailable,
    discountNotificationSent: user.discountNotificationSent,
    successfulBookingsCount: user.successfulBookingsCount,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function toPublicNotification(notification) {
  return {
    notificationId: notification._id.toString(),
    userId: notification.userId.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata,
    read: notification.read,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt
  };
}

router.use(requireDatabase);

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const missingFields = getMissingFields(req.body, [
      "firstName",
      "surname",
      "email",
      "password"
    ]);

    if (missingFields.length > 0) {
      return sendError(res, 400, "Missing required fields", { missingFields });
    }

    const firstName = String(req.body.firstName).trim();
    const surname = String(req.body.surname).trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password);

    if (!firstName || !surname) {
      return sendError(res, 400, "First name and surname cannot be empty");
    }

    if (!isValidEmail(email)) {
      return sendError(res, 400, "Email address is invalid");
    }

    if (password.length < 6) {
      return sendError(res, 400, "Password must contain at least 6 characters");
    }

    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      return sendError(res, 409, "A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      surname,
      email,
      passwordHash
    });

    return sendSuccess(res, toPublicUser(user), 201);
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const missingFields = getMissingFields(req.body, ["email", "password"]);

    if (missingFields.length > 0) {
      return sendError(res, 400, "Missing required fields", { missingFields });
    }

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password);

    if (!isValidEmail(email)) {
      return sendError(res, 400, "Email address is invalid");
    }

    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      return sendError(res, 401, "Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return sendError(res, 401, "Invalid email or password");
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email
      },
      getEnv("JWT_SECRET", "development-only-secret"),
      {
        expiresIn: "1h"
      }
    );

    return sendSuccess(res, {
      token,
      user: toPublicUser(user)
    });
  })
);

router.get(
  "/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, toPublicUser(user));
  })
);

router.get(
  "/:userId/notifications",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const user = await User.exists({ _id: userId });

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100);

    return sendSuccess(res, notifications.map(toPublicNotification));
  })
);

router.post(
  "/:userId/notifications",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const missingFields = getMissingFields(req.body, ["type", "title", "message"]);

    if (missingFields.length > 0) {
      return sendError(res, 400, "Missing required fields", { missingFields });
    }

    const user = await User.exists({ _id: userId });

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const notification = await Notification.create({
      userId,
      type: String(req.body.type).trim(),
      title: String(req.body.title).trim(),
      message: String(req.body.message).trim(),
      metadata: req.body.metadata || {}
    });

    return sendSuccess(res, toPublicNotification(notification), 201);
  })
);

router.post(
  "/:userId/notifications/discount",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        successfulBookingsCount: { $gte: 3 },
        discountNotificationSent: false
      },
      {
        discountAvailable: true,
        discountNotificationSent: true
      },
      {
        new: true
      }
    );

    if (!user) {
      const existingUser = await User.findById(userId);

      if (!existingUser) {
        return sendError(res, 404, "User not found");
      }

      return sendSuccess(res, {
        created: false,
        user: toPublicUser(existingUser)
      });
    }

    const notification = await Notification.create({
      userId,
      type: "DISCOUNT_AVAILABLE",
      title: "Discount available",
      message: "You have completed three successful bookings. A discount is now available for your next rides.",
      metadata: {
        successfulBookingsCount: user.successfulBookingsCount,
        discountMultiplier: 0.9
      }
    });

    return sendSuccess(res, {
      created: true,
      user: toPublicUser(user),
      notification: toPublicNotification(notification)
    }, 201);
  })
);

router.patch(
  "/:userId/notifications/:notificationId/read",
  asyncHandler(async (req, res) => {
    const { userId, notificationId } = req.params;

    if (!isValidObjectId(userId) || !isValidObjectId(notificationId)) {
      return sendError(res, 400, "Invalid user ID or notification ID");
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        userId
      },
      {
        read: true
      },
      {
        new: true
      }
    );

    if (!notification) {
      return sendError(res, 404, "Notification not found");
    }

    return sendSuccess(res, toPublicNotification(notification));
  })
);

router.patch(
  "/:userId/booking-count",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const incrementBy = Number(req.body.incrementBy || 1);

    if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
      return sendError(res, 400, "incrementBy must be a positive integer");
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    user.successfulBookingsCount += incrementBy;

    if (user.successfulBookingsCount >= 3 && !user.discountNotificationSent) {
      user.discountAvailable = true;
    }

    await user.save();

    return sendSuccess(res, toPublicUser(user));
  })
);

router.patch(
  "/:userId/discount/consume",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    if (!user.discountAvailable) {
      return sendError(res, 400, "No discount is available for this user");
    }

    user.discountAvailable = false;
    await user.save();

    return sendSuccess(res, toPublicUser(user));
  })
);

module.exports = router;
