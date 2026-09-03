import bcrypt from "bcrypt";
import crypto from "crypto";
import EmailOtp, { EmailOtpPurpose } from "../models/emailOtpModel.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function issueEmailOtp({ email, userId, purpose, payload }: { email: string; userId?: string; purpose: EmailOtpPurpose; payload?: Record<string, unknown> }) {
  const normalizedEmail = email.trim().toLowerCase();
  await EmailOtp.deleteMany({ email: normalizedEmail, purpose, ...(userId ? { userId } : {}) });
  const code = crypto.randomInt(100000, 1_000_000).toString();
  await EmailOtp.create({ email: normalizedEmail, userId, purpose, payload, codeHash: await bcrypt.hash(code, 12), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  return code;
}

export async function consumeEmailOtp({ email, userId, purpose, code }: { email: string; userId?: string; purpose: EmailOtpPurpose; code: string }) {
  const otp = await EmailOtp.findOne({ email: email.trim().toLowerCase(), purpose, ...(userId ? { userId } : {}), expiresAt: { $gt: new Date() } }).select("+codeHash").sort({ createdAt: -1 });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return null;
  if (!(await bcrypt.compare(code, otp.codeHash))) {
    otp.attempts += 1;
    await otp.save();
    return null;
  }
  const payload = otp.payload as Record<string, unknown> | undefined;
  await otp.deleteOne();
  return payload;
}
