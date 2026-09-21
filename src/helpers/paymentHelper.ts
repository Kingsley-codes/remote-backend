import { normalizeStage } from "../utils/productionStages.js";
import crypto from "crypto";
import { PaystackEventData } from "../interface/allInterfaces.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import { awardReferralCommission } from "../services/referralService.js";
import Transaction from "../models/transactionModel.js";
import mongoose from "mongoose";
import { writeAuditLog } from "../services/auditService.js";
import { logInfo } from "../utils/logger.js";
import {
  sendInvestmentPaymentEmail,
  sendWithdrawalCompletedEmail,
} from "../services/emailService.js";

// Helper function to generate unique IDs
export const generatePaymentID = () =>
  "RAI-" + crypto.randomBytes(8).toString("hex").toUpperCase();

export const generateOrderID = () =>
  "RAO-" + crypto.randomBytes(8).toString("hex").toUpperCase();

export const generateReference = (prefix = "ps") => {
  const unique = crypto.randomBytes(12).toString("hex"); // 12-char random string
  return `${prefix}_${unique}`;
};

export const handleChargeSuccess = async (
  eventData: PaystackEventData,
): Promise<{
  payment: InstanceType<typeof Transaction> | null;
  investment: InstanceType<typeof Investment> | null;
  newlySettled: boolean;
}> => {
  const session = await mongoose.startSession();
  let payment: InstanceType<typeof Transaction> | null = null;
  let investment: InstanceType<typeof Investment> | null = null;
  let emailTitle = "";
  let newlySettled = false;

  try {
    await session.withTransaction(async () => {
      payment = await Transaction.findOne({
        transactionRef: eventData.reference,
        transactionType: "investment-payment",
      }).session(session);
      if (!payment) throw new Error("Payment record not found");

      const expectedAmount = Math.round(payment.amount * 100);
      if (eventData.amount !== expectedAmount || eventData.currency?.toUpperCase() !== "NGN") {
        throw new Error("Payment provider amount or currency mismatch");
      }

      investment = await Investment.findOne({ payment: payment._id }).session(session);
      if (payment.status === "completed") {
        if (!investment) throw new Error("Completed payment is missing its investment");
        return;
      }

      const units = payment.units ?? Number(eventData.metadata?.units);
      if (!Number.isSafeInteger(units) || units <= 0) throw new Error("Invalid settled unit count");

      const produce = await Produce.findOneAndUpdate(
        { _id: payment.produce, remainingUnit: { $gte: units } },
        { $inc: { remainingUnit: -units } },
        { new: true, session },
      );
      if (!produce) throw new Error("Insufficient units to settle this paid transaction");

      const created = await Investment.create([{
        user: payment.user,
        payment: payment._id,
        produce: payment.produce,
        orderID: generateOrderID(),
        units,
        title: produce.title,
        totalPrice: payment.amount,
        customerEmail: payment.userEmail,
        orderStatus: "confirmed",
        transactionRef: payment.transactionRef,
        duration: produce.duration,
        ROI: produce.ROI,
        stage: normalizeStage(produce.stage, produce.category),
      }], { session });
      investment = created[0]!;

      await awardReferralCommission(payment.user.toString(), investment._id.toString(), session);
      await User.findByIdAndUpdate(payment.user, { hasActiveInvestment: true }, { session });

      payment.status = "completed";
      payment.date = eventData.paid_at ? new Date(eventData.paid_at) : new Date();
      await payment.save({ session });
      await writeAuditLog({
        action: "PAYMENT_SETTLED",
        entityType: "PAYMENT",
        entityId: payment.id,
        actorType: "SYSTEM",
        actorId: "paystack",
        actorName: "Paystack",
        details: `Payment ${payment.transactionRef} settled`,
        session,
      });
      emailTitle = produce.title;
      newlySettled = true;
    });
  } finally {
    await session.endSession();
  }

  if (newlySettled && payment) {
    const settled = payment as InstanceType<typeof Transaction>;
    const investor = await User.findById(settled.user).select("firstName email").lean();
    if (investor?.email) {
      void sendInvestmentPaymentEmail(investor.email, investor.firstName, emailTitle, settled.amount);
    }
  }
  return { payment, investment, newlySettled };
};

export const handleChargeFailed = async (eventData: PaystackEventData) => {
  logInfo("payment.charge_failed", { reference: eventData.reference });

  const payment = await Transaction.findOne({
    transactionRef: eventData.reference,
    transactionType: "investment-payment",
  });

  if (payment && payment.status === "pending") {
    payment.status = "failed";
    await payment.save();
    logInfo("payment.marked_failed", { reference: eventData.reference });
  }
};

export const handleTransferSuccess = async (data: any) => {
  const reference = data.reference;
  const session = await Transaction.startSession();
  let withdrawal: any = null;

  try {
    await session.withTransaction(async () => {
      withdrawal = await Transaction.findOneAndUpdate(
        { transactionRef: reference, transactionType: "withdrawal", status: "pending" },
        { status: "completed", transferInitiationStatus: "submitted" },
        { new: true, session },
      );

      if (!withdrawal) return;

      const walletUpdate = await Wallet.updateOne(
        { user: withdrawal.user, lockedBalance: { $gte: withdrawal.amount } },
        { $inc: { lockedBalance: -withdrawal.amount } },
        { session },
      );
      if (walletUpdate.modifiedCount !== 1) {
        throw new Error("Unable to settle withdrawal wallet balance");
      }
    });
  } finally {
    await session.endSession();
  }

  if (!withdrawal) return;

  const user = await User.findById(withdrawal.user)
    .select("firstName email")
    .lean();
  if (user?.email) {
    void sendWithdrawalCompletedEmail(user.email, user.firstName, withdrawal.amount);
  }
};

export const handleTransferFailed = async (data: any) => {
  const reference = data.reference;
  const session = await Transaction.startSession();

  try {
    await session.withTransaction(async () => {
      const withdrawal = await Transaction.findOneAndUpdate(
        { transactionRef: reference, transactionType: "withdrawal", status: "pending" },
        { status: "failed", transferInitiationStatus: "rejected" },
        { new: true, session },
      );

      if (!withdrawal) return;

      const walletUpdate = await Wallet.updateOne(
        { user: withdrawal.user, lockedBalance: { $gte: withdrawal.amount } },
        {
          $inc: {
            lockedBalance: -withdrawal.amount,
            balance: withdrawal.amount,
          },
        },
        { session },
      );
      if (walletUpdate.modifiedCount !== 1) {
        throw new Error("Unable to release failed withdrawal balance");
      }
    });
  } finally {
    await session.endSession();
  }
};
