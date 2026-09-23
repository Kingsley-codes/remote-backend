import { productionStages } from "../utils/productionStages.js";
import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const investmentSchema = new Schema(
  {
    orderID: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    payment: {
      type: String,
      ref: "Transaction",
      required: true,
      unique: true,
    },
    produce: {
      type: String,
      ref: "Produce",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    units: {
      type: Number,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    orderStatus: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
    transactionRef: {
      type: String,
    },
    status: {
      type: String,
      enum: ["ongoing", "completed"],
      default: "ongoing",
    },
    stage: {
      type: String,
      enum: [...productionStages, "accepting-investments"],
      default: "preparation",
    },
    harvestChoice: {
      type: String,
      enum: ["physical-produce", "cash-return"],
      default: null,
    },
    harvestFulfillmentStatus: {
      type: String,
      enum: [
        "pending-selection",
        "pending-delivery",
        "delivered",
        "pending-approval",
        "approved",
      ],
      default: "pending-selection",
    },
    harvestChoiceDate: {
      type: Date,
    },
    harvestDeliveredAt: {
      type: Date,
    },
    cashReturnApprovedAt: {
      type: Date,
    },
    cashReturnAmount: {
      type: Number,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    customerEmail: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    referralBonus: { type: Number, min: 0 },
    profit: { type: Number, required: true },
    track: {
      id: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      startMonth: { type: Number, required: true, min: 1, max: 12 },
      endMonth: { type: Number, required: true, min: 1, max: 12 },
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isRollover: { type: Boolean, default: false },
    rolledOverFrom: { type: Schema.Types.ObjectId, ref: "Investment" },
    rolledOverTo: { type: Schema.Types.ObjectId, ref: "Investment" },
    rolledOverAt: { type: Date },
  },
  { timestamps: true },
);

export type Investment = InferSchemaType<typeof investmentSchema>;
export type InvestmentDocument = HydratedDocument<Investment>;

const Investment = model<Investment>("Investment", investmentSchema);

export default Investment;
