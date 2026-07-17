import { Schema, model } from "mongoose";

const referralSchema = new Schema({
  referrer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  referredUser: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  referralCode: { type: String, required: true, index: true },
  status: { type: String, enum: ["registered", "rewarded"], default: "registered", index: true },
  commission: { type: Number, default: 0 },
  qualifyingInvestment: { type: Schema.Types.ObjectId, ref: "Investment" },
  rewardedAt: Date,
}, { timestamps: true });

export default model("Referral", referralSchema);
