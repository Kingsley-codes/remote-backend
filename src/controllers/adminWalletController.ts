import type { Request, Response } from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import { writeAuditLog } from "../services/auditService.js";
import { sendAdminWithdrawalEmail } from "../services/emailService.js";
import { logError } from "../utils/logger.js";

class WithdrawalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const adminWithdrawBalance = async (req: Request, res: Response) => {
  if (!req.admin) return res.status(401).json({ success: false, message: "Admin credentials required" });
  const { amount, reason, idempotencyKey } = req.body ?? {};
  const userId = typeof req.params.userId === "string" ? req.params.userId.toLowerCase() : req.params.userId;
  if (typeof userId !== "string" || !mongoose.isObjectIdOrHexString(userId) ||
      typeof amount !== "number" || !Number.isFinite(amount) || amount < 0.01 ||
      !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 ||
      typeof reason !== "string" || !reason.trim() || reason.trim().length > 500 ||
      typeof idempotencyKey !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, message: "Provide a valid user, positive amount (up to two decimal places), reason (1?500 characters), and idempotency key" });
  }
  const normalizedAmount = Math.round(amount * 100) / 100;
  const note = reason.trim();
  const key = "admin-withdrawal:" + req.admin.toString() + ":" + idempotencyKey;
  try {
    const admin = await Admin.findById(req.admin).select("firstName lastName email").lean();
    const user = await User.findById(userId).select("firstName email").lean();
    if (!admin) throw new WithdrawalError(401, "Admin not found");
    if (!user) throw new WithdrawalError(404, "User not found");
    const adminName = [admin.firstName, admin.lastName].filter(Boolean).join(" ");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const existing = await Transaction.findOne({ idempotencyKey: key }).session(session);
        if (existing) {
          if (existing.user.toString() !== userId || existing.amount !== normalizedAmount || existing.settlementNote !== note)
            throw new WithdrawalError(409, "This request key was already used for a different withdrawal");
          return;
        }
        const wallet = await Wallet.findOneAndUpdate(
          { user: userId, currency: "NGN", balance: { $gte: normalizedAmount } },
          [{ $set: { balance: { $round: [{ $subtract: ["$balance", normalizedAmount] }, 2] } } }],
          { session, new: false },
        );
        if (!wallet) throw new WithdrawalError(400, "Wallet unavailable or insufficient available balance");
        const balanceAfter = Math.round((wallet.balance - normalizedAmount) * 100) / 100;
        const reference = "ADMIN-WD-" + randomUUID();
        const [withdrawal] = await Transaction.create([{
          user: userId, userEmail: user.email, transactionType: "withdrawal",
          transactionID: reference, transactionRef: reference, idempotencyKey: key,
          amount: normalizedAmount, currency: "NGN", status: "completed", paymentMethod: "wallet",
          initiatedByAdmin: req.admin, adminName, settlementNote: note,
          walletBalanceBefore: wallet.balance, walletBalanceAfter: balanceAfter,
          withdrawalEmailStatus: "pending",
        }], { session });
        await writeAuditLog({
          action: "CREATE", entityType: "WITHDRAWAL", entityId: withdrawal!._id.toString(),
          actorType: "ADMIN", actorId: req.admin!.toString(), actorName: adminName, actorEmail: admin.email,
          details: "Admin wallet deduction; no bank transfer. Reason: " + note,
          changes: { before: { userId, balance: wallet.balance }, after: {
            userId, balance: balanceAfter, amount: normalizedAmount, currency: "NGN", reference, reason: note, status: "completed",
          } }, request: req, session,
        });
      });
    } catch (error) {
      // A concurrent retry can lose the unique-key race; return the committed result.
      if (!(error instanceof mongoose.mongo.MongoServerError && error.code === 11000)) throw error;
    } finally { await session.endSession(); }
    const withdrawal = await Transaction.findOne({ idempotencyKey: key });
    if (!withdrawal) throw new Error("Withdrawal record unavailable");
    if (withdrawal.user.toString() !== userId || withdrawal.amount !== normalizedAmount || withdrawal.settlementNote !== note)
      throw new WithdrawalError(409, "This request key was already used for a different withdrawal");
    res.locals.auditRecorded = true;
    if (withdrawal.withdrawalEmailStatus !== "sent") {
      try {
        await sendAdminWithdrawalEmail(user.email, user.firstName, {
          amount: withdrawal.amount, reference: withdrawal.transactionID, reason: note,
          adminName: withdrawal.adminName || "Remote Agric admin",
          balanceBefore: withdrawal.walletBalanceBefore!, balanceAfter: withdrawal.walletBalanceAfter!,
          date: withdrawal.createdAt,
        });
        withdrawal.withdrawalEmailStatus = "sent";
      } catch (error) {
        withdrawal.withdrawalEmailStatus = "failed";
        logError("admin.withdrawal_email_failed", error, { transactionId: withdrawal._id.toString() });
      }
      try { await withdrawal.save(); }
      catch (error) { logError("admin.withdrawal_email_status_failed", error); }
    }
    const wallet = await Wallet.findOne({ user: userId }).select("balance currency walletId").lean();
    return res.json({ success: true, data: { wallet, withdrawal },
      message: withdrawal.withdrawalEmailStatus === "sent"
        ? "Withdrawal recorded and notification email sent."
        : "Withdrawal recorded, but the notification email failed. Retry this request to resend without another deduction.",
    });
  } catch (error) {
    if (error instanceof WithdrawalError) return res.status(error.status).json({ success: false, message: error.message });
    logError("admin.withdrawal_failed", error);
    return res.status(500).json({ success: false, message: "Unable to record withdrawal. Retry with the same request key." });
  }
};
