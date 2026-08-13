import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const transactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ["investment-payment", "withdrawal", "referral-reward"],
      required: true,
      index: true,
    },
    produce: {
      type: String,
      ref: "Produce",
    },
    transactionID: {
      type: String,
      required: true,
      unique: true,
    },
    paymentID: {
      type: String,
    },
    userEmail: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    referredUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    transactionRef: {
      type: String,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank", "wallet"],
    },
    status: {
      type: String,
      enum: ["pending", "completed", "refunded", "cancelled", "failed"],
      default: "pending",
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export type Transaction = InferSchemaType<typeof transactionSchema>;
export type TransactionDocument = HydratedDocument<Transaction>;

const Transaction = model<Transaction>("Transaction", transactionSchema);
export default Transaction;
