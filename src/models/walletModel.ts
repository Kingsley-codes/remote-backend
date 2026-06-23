import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const walletSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    lockedBalance: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "NGN",
    },
    walletId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true },
);
export type Wallet = InferSchemaType<typeof walletSchema>;
export type WalletDocument = HydratedDocument<Wallet>;

const Wallet = model<Wallet>("Wallet", walletSchema);

export default Wallet;
