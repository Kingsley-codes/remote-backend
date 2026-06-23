import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const bankAccountSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    accountNumber: {
      type: String,
      required: true,
    },
    bankCode: {
      type: String,
      required: true,
    },
    recipientCode: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export type BankAccount = InferSchemaType<typeof bankAccountSchema>;
export type BankAccountDocument = HydratedDocument<BankAccount>;

const BankAccount = model<BankAccount>("BankAccount", bankAccountSchema);

export default BankAccount;
