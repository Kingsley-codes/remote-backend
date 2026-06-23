import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const PaymentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    produce: {
      type: String,
      ref: "Produce",
      required: true,
    },
    paymentID: {
      type: String,
      required: true,
      unique: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    transactionRef: {
      type: String,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank", "wallet"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Refunded", "Completed", "Cancelled", "Failed"],
      default: "Pending",
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export type Payment = InferSchemaType<typeof PaymentSchema>;
export type PaymentDocument = HydratedDocument<Payment>;

const Payment = model<Payment>("Payment", PaymentSchema);

export default Payment;
