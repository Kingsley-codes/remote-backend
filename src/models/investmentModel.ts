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
      ref: "Payment",
      required: true,
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
      enum: ["pre-harvest", "harvest", "post-harvest"],
      default: "pre-harvest",
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
    ROI: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export type Investment = InferSchemaType<typeof investmentSchema>;
export type InvestmentDocument = HydratedDocument<Investment>;

const Investment = model<Investment>("Investment", investmentSchema);

export default Investment;
