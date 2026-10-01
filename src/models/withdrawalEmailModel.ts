import { Schema, model } from "mongoose";

const schema = new Schema({
  eventKey: { type: String, required: true, unique: true },
  transaction: { type: Schema.Types.ObjectId, ref: "Transaction", required: true },
  event: { type: String, enum: ["requested", "approved"], required: true },
  status: { type: String, enum: ["pending", "sending", "sent"], default: "pending", required: true },
  attempts: { type: Number, default: 0 },
  nextAttempt: { type: Date, default: Date.now },
  lockedUntil: { type: Date },
  lockToken: { type: String },
  sentAt: { type: Date },
}, { timestamps: true });
schema.index({ status: 1, nextAttempt: 1 });
export default model("WithdrawalEmail", schema);
