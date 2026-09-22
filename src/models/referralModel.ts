import { Schema, model } from "mongoose";

const referralSchema = new Schema(
  {
    referrer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referredUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    referralCode: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "registered", "rewarded"],
      default: "active",
      index: true,
    },
    commission: {
      type: Number,
      default: 0,
    },
    qualifyingInvestment: {
      type: Schema.Types.ObjectId,
      ref: "Investment",
    },
    rewardedAt: Date,
    rewardedUnits: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true },
);

export default model("Referral", referralSchema);
