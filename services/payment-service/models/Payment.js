const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true
    },
    cabFare: {
      type: Number,
      required: true,
      min: 0
    },
    cabMultiplier: {
      type: Number,
      required: true,
      min: 0
    },
    daytimeMultiplier: {
      type: Number,
      required: true,
      min: 0
    },
    passengersMultiplier: {
      type: Number,
      required: true,
      min: 0
    },
    discountMultiplier: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ["paid", "failed"],
      default: "paid",
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);
