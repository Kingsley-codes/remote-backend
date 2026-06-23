import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const withdrawalSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    reference: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export type Withdrawal = InferSchemaType<typeof withdrawalSchema>;
export type WithdrawalDocument = HydratedDocument<Withdrawal>;

const Withdrawal = model<Withdrawal>("Withdrawal", withdrawalSchema);

export default Withdrawal;
