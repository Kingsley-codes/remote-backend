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
      enum: ["investment-payment", "withdrawal", "referral-reward", "harvest-return"],
      required: true,
      index: true,
    },
    produce: {
      type: String,
      ref: "Produce",
    },
    trackId: { type: Schema.Types.ObjectId },
    startsAt: { type: Date },
    endsAt: { type: Date },
    rolloverInvestment: { type: Schema.Types.ObjectId, ref: "Investment" },
    transactionID: {
      type: String,
      required: true,
      unique: true,
    },
    paymentID: {
      type: String,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
    idempotencyRequestHash: {
      type: String,
    },
    userEmail: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
    },
    referralBonus: { type: Number, min: 0 },
    settlementNote: { type: String },
    units: {
      type: Number,
      min: 1,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    referredUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    referralRewardInvestment: {
      type: Schema.Types.ObjectId,
      ref: "Investment",
    },
    transactionRef: {
      type: String,
      index: true,
    },
    authorizationUrl: {
      type: String,
    },
    accessCode: {
      type: String,
    },
    initializationStatus: {
      type: String,
      enum: ["processing", "initialized", "failed"],
    },
    transferInitiationStatus: {
      type: String,
      enum: ["processing", "submitted", "uncertain", "rejected"],
    },
    transferRecipientCode: {
      type: String,
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

transactionSchema.index(
  { referralRewardInvestment: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionType: "referral-reward",
      referralRewardInvestment: { $exists: true },
    },
  },
);

export type Transaction = InferSchemaType<typeof transactionSchema>;
export type TransactionDocument = HydratedDocument<Transaction>;

const Transaction = model<Transaction>("Transaction", transactionSchema);
export default Transaction;
