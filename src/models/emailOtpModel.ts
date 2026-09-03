import { Schema, model } from "mongoose";

export type EmailOtpPurpose = "signup" | "password-reset" | "bank-account";

const emailOtpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: String },
    purpose: {
      type: String,
      enum: ["signup", "password-reset", "bank-account"],
      required: true,
      index: true,
    },
    codeHash: { type: String, required: true, select: false },
    payload: { type: Schema.Types.Mixed },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

emailOtpSchema.index({ email: 1, purpose: 1, userId: 1, createdAt: -1 });

const EmailOtp = model("EmailOtp", emailOtpSchema);

export default EmailOtp;
