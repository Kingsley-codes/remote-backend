import type { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import BankAccount from "../models/bankAccountModel.js";
import Transaction from "../models/transactionModel.js";
import { writeAuditLog } from "../services/auditService.js";
import { logError } from "../utils/logger.js";
import { resolveBankName } from "../services/bankService.js";
import { queueWithdrawalNotifications, publishWithdrawalNotification, deliverWithdrawalEmails } from "../services/withdrawalNotificationService.js";
import { uploadReceiptToCloudinary, deleteReceiptFromCloudinary, InvalidReceiptError } from "../middleware/uploadMiddleware.js";

class WithdrawalError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const generateWithdrawalID = () =>
  "RAW-" + Math.random().toString(36).substring(2, 10).toUpperCase();

const requestResponse = (
  res: Response,
  withdrawal: InstanceType<typeof Transaction>,
) => {
  const pending = withdrawal.status === "pending";
  const completed = withdrawal.status === "completed";
  return res.status(pending ? 202 : completed ? 200 : 409).json({
    success: pending || completed,
    message: pending
      ? "Your withdrawal request is being processed and will be completed within 24 hours."
      : completed
        ? "Withdrawal completed"
        : "This withdrawal is no longer pending. Submit a new request.",
    ...(!pending && !completed ? { retryableWithNewKey: true } : {}),
    data: {
      id: withdrawal._id,
      transactionID: withdrawal.transactionID,
      amount: withdrawal.amount,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    },
  });
};

export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new WithdrawalError(401, "Unauthorized");
    const key = req.get("Idempotency-Key")?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{16,128}$/.test(key))
      throw new WithdrawalError(
        400,
        "A valid Idempotency-Key header is required",
      );
    const { amount, password } = req.body ?? {};
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 500
    )
      throw new WithdrawalError(
        400,
        "Withdrawal must be a whole amount of at least ₦500",
      );
    const user = await User.findOne({ _id: req.user, status: "active" }).select(
      "+password",
    );
    if (
      !user?.password ||
      typeof password !== "string" ||
      !(await bcrypt.compare(password, user.password))
    )
      throw new WithdrawalError(400, "Invalid credentials");
    const existing = await Transaction.findOne({ idempotencyKey: key });
    const replay = (withdrawal: InstanceType<typeof Transaction>) => {
      if (
        withdrawal.user.toString() !== req.user!.toString() ||
        withdrawal.amount !== amount ||
        withdrawal.transactionType !== "withdrawal"
      )
        throw new WithdrawalError(
          409,
          "This idempotency key was already used for another request",
        );
      if (withdrawal.withdrawalFlow === "manual") void deliverWithdrawalEmails(String(withdrawal._id));
      return requestResponse(res, withdrawal);
    };
    if (existing) return replay(existing);
    const [bank, wallet] = await Promise.all([
      BankAccount.findOne({ user: req.user }).select("+accountNumber"),
      Wallet.findOne({ user: req.user, currency: "NGN" }),
    ]);
    if (!bank)
      throw new WithdrawalError(
        400,
        "Add a bank account before requesting a withdrawal",
      );
    if (!wallet || wallet.balance < amount)
      throw new WithdrawalError(400, "Insufficient wallet balance");
    const bankName = bank.bankName || await resolveBankName(bank.bankCode);
    try {
      const session = await mongoose.startSession();
      let withdrawal: InstanceType<typeof Transaction> | undefined;
      let notification: Awaited<ReturnType<typeof queueWithdrawalNotifications>>;
      try {
        await session.withTransaction(async () => {
          [withdrawal] = await Transaction.create([{
            user: req.user,
            userEmail: user.email,
            transactionType: "withdrawal",
            transactionID: generateWithdrawalID(),
            idempotencyKey: key,
            amount,
            currency: "NGN",
            status: "pending",
            paymentMethod: "bank",
            withdrawalFlow: "manual",
            withdrawalBankAccount: {
              accountName: bank.accountName,
              accountNumber: bank.accountNumber,
              bankCode: bank.bankCode,
              bankName,
            },
          }], { session });
          notification = await queueWithdrawalNotifications(withdrawal!, "requested", session);
        });
      } finally { await session.endSession(); }
      if (!withdrawal) throw new Error("Withdrawal not created");
      publishWithdrawalNotification(notification);
      void deliverWithdrawalEmails(String(withdrawal._id));
      return requestResponse(res, withdrawal);
    } catch (error) {
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000
      ) {
        const committed = await Transaction.findOne({ idempotencyKey: key });
        if (committed) return replay(committed);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof WithdrawalError)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    logError("withdrawal.request_failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to request withdrawal. Retry with the same request key.",
    });
  }
};

export const getWithdrawalDetails = async (req: Request, res: Response) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.withdrawalId))
      throw new WithdrawalError(400, "Invalid withdrawal ID");
    const withdrawal = await Transaction.findOne({
      _id: req.params.withdrawalId,
      transactionType: "withdrawal",
    })
      .select("+withdrawalBankAccount")
      .populate("user", "firstName lastName email farmerID")
      .populate("approvedBy", "firstName lastName")
      .populate("cancelledBy", "firstName lastName")
      .lean();
    if (!withdrawal) throw new WithdrawalError(404, "Withdrawal not found");
    if (withdrawal.withdrawalBankAccount && !withdrawal.withdrawalBankAccount.bankName) {
      try {
        withdrawal.withdrawalBankAccount.bankName = await resolveBankName(withdrawal.withdrawalBankAccount.bankCode);
        await Transaction.updateOne({ _id: withdrawal._id }, { $set: { "withdrawalBankAccount.bankName": withdrawal.withdrawalBankAccount.bankName } });
      } catch (error) { logError("withdrawal.bank_name_lookup_failed", error); }
    }
    return res.json({ success: true, data: withdrawal });
  } catch (error) {
    if (error instanceof WithdrawalError)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    logError("admin.withdrawal_details_failed", error);
    return res
      .status(500)
      .json({ success: false, message: "Unable to load withdrawal details" });
  }
};

export const cancelWithdrawal = async (req: Request, res: Response) => {
  try {
    if (!req.admin) throw new WithdrawalError(401, "Admin credentials required");
    if (!mongoose.isObjectIdOrHexString(req.params.withdrawalId))
      throw new WithdrawalError(400, "Invalid withdrawal ID");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason || reason.length > 1000)
      throw new WithdrawalError(400, "Provide a cancellation reason between 1 and 1000 characters");

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const withdrawal = await Transaction.findOne({
          _id: req.params.withdrawalId, transactionType: "withdrawal",
        }).session(session);
        if (!withdrawal) throw new WithdrawalError(404, "Withdrawal not found");
        if (withdrawal.withdrawalFlow !== "manual")
          throw new WithdrawalError(409, "Withdrawals from the previous payment flow cannot be manually cancelled");
        // Repeated requests must not overwrite the original reason or audit record.
        if (withdrawal.status === "cancelled") return;
        if (withdrawal.status !== "pending")
          throw new WithdrawalError(409, "Only pending withdrawals can be cancelled");
        // Manual requests do not debit the wallet until approval.
        withdrawal.status = "cancelled";
        withdrawal.cancellationReason = reason;
        withdrawal.cancelledBy = req.admin!;
        withdrawal.cancelledAt = new Date();
        await withdrawal.save({ session });
        await writeAuditLog({
          action: "STATUS_CHANGE", entityType: "WITHDRAWAL",
          entityId: withdrawal._id.toString(), actorType: "ADMIN",
          actorId: req.admin!.toString(),
          details: `Cancelled withdrawal ${withdrawal.transactionID}`,
          changes: { before: { status: "pending" }, after: { status: "cancelled", cancellationReason: reason } },
          request: req, session,
        });
      });
    } finally { await session.endSession(); }
    res.locals.auditRecorded = true;
    return res.json({ success: true, message: "Withdrawal cancelled" });
  } catch (error) {
    if (error instanceof WithdrawalError)
      return res.status(error.status).json({ success: false, message: error.message });
    logError("admin.withdrawal_cancellation_failed", error);
    return res.status(500).json({ success: false, message: "Unable to cancel withdrawal. You can safely retry." });
  }
};

export const approveWithdrawal = async (req: Request, res: Response) => {
  let receipt: Awaited<ReturnType<typeof uploadReceiptToCloudinary>> | undefined;
  const cleanupReceipt = async () => {
    if (!receipt) return;
    try {
      // Never remove a receipt referenced by a committed or ambiguously committed approval.
      if (!await Transaction.exists({ "withdrawalReceipt.publicId": receipt.publicId })) {
        await deleteReceiptFromCloudinary(receipt.publicId);
      }
    } catch (error) { logError("withdrawal.receipt_cleanup_failed", error); }
  };
  try {
    if (!req.admin)
      throw new WithdrawalError(401, "Admin credentials required");
    if (!mongoose.isObjectIdOrHexString(req.params.withdrawalId))
      throw new WithdrawalError(400, "Invalid withdrawal ID");
    const existing = await Transaction.findOne({ _id: req.params.withdrawalId, transactionType: "withdrawal", withdrawalFlow: "manual" });
    if (!existing) throw new WithdrawalError(404, "Manual withdrawal not found");
    if (existing.status === "completed") {
      void deliverWithdrawalEmails(String(existing._id));
      res.locals.auditRecorded = true;
      return res.json({ success: true, message: "Withdrawal already approved" });
    }
    if (existing.status !== "pending") throw new WithdrawalError(409, "Only pending withdrawals can be approved");
    if (!req.file) throw new WithdrawalError(400, "Upload an image or PDF payment receipt before approving");
    receipt = await uploadReceiptToCloudinary(req.file);
    const session = await mongoose.startSession();
    let notification: Awaited<ReturnType<typeof queueWithdrawalNotifications>>;
    try {
      await session.withTransaction(async () => {
        notification = undefined;
        const withdrawal = await Transaction.findOne({
          _id: req.params.withdrawalId,
          transactionType: "withdrawal",
        }).session(session);
        if (!withdrawal) throw new WithdrawalError(404, "Withdrawal not found");
        if (withdrawal.withdrawalFlow !== "manual")
          throw new WithdrawalError(
            409,
            "This withdrawal belongs to the previous payment flow and cannot be manually approved",
          );
        if (withdrawal.status === "completed") return;
        if (withdrawal.status !== "pending")
          throw new WithdrawalError(
            409,
            "Only pending withdrawals can be approved",
          );
        const wallet = await Wallet.findOneAndUpdate(
          {
            user: withdrawal.user,
            currency: withdrawal.currency,
            balance: { $gte: withdrawal.amount },
          },
          { $inc: { balance: -withdrawal.amount } },
          { session, new: false },
        );
        if (!wallet)
          throw new WithdrawalError(
            409,
            "Insufficient wallet balance. This request remains pending.",
          );
        withdrawal.status = "completed";
        withdrawal.approvedBy = req.admin!;
        withdrawal.approvedAt = new Date();
        withdrawal.walletBalanceBefore = wallet.balance;
        withdrawal.walletBalanceAfter = wallet.balance - withdrawal.amount;
        withdrawal.withdrawalReceipt = receipt!;
        await withdrawal.save({ session });
        notification = await queueWithdrawalNotifications(withdrawal, "approved", session);
        await writeAuditLog({
          action: "STATUS_CHANGE",
          entityType: "WITHDRAWAL",
          entityId: withdrawal._id.toString(),
          actorType: "ADMIN",
          actorId: req.admin!.toString(),
          details: `Approved withdrawal ${withdrawal.transactionID}`,
          changes: {
            before: { status: "pending", balance: wallet.balance },
            after: {
              status: "completed",
              balance: withdrawal.walletBalanceAfter,
            },
          },
          request: req,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    res.locals.auditRecorded = true;
    await cleanupReceipt();
    publishWithdrawalNotification(notification);
    void deliverWithdrawalEmails(String(req.params.withdrawalId));
    return res.json({
      success: true,
      message: "Withdrawal approved and wallet balance deducted",
    });
  } catch (error) {
    await cleanupReceipt();
    if (error instanceof InvalidReceiptError) return res.status(400).json({ success: false, message: error.message });
    if (error instanceof WithdrawalError)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    logError("admin.withdrawal_approval_failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to approve withdrawal. You can safely retry.",
    });
  }
};
