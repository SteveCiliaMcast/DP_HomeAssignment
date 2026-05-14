const mongoose = require("mongoose");

const FareEstimateSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: "EUR",
      trim: true
    },
    source: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    _id: false
  }
);

const BookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    startingLocation: {
      type: String,
      required: true,
      trim: true
    },
    endingLocation: {
      type: String,
      required: true,
      trim: true
    },
    bookingDateTime: {
      type: Date,
      required: true,
      index: true
    },
    passengers: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    cabType: {
      type: String,
      required: true,
      enum: ["Economic", "Premium", "Executive"]
    },
    estimatedFare: {
      type: FareEstimateSchema,
      required: true
    },
    status: {
      type: String,
      enum: ["confirmed", "completed", "cancelled"],
      default: "confirmed",
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
