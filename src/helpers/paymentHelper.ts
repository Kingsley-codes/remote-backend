import crypto from "crypto";
import { PaystackEventData } from "../interface/allInterfaces.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import { awardReferralCommission } from "../services/referralService.js";
import Transaction from "../models/transactionModel.js";
import {
  sendInvestmentPaymentEmail,
  sendWithdrawalCompletedEmail,
} from "../services/emailService.js";

// Helper function to generate unique IDs
export const generatePaymentID = () =>
  "RAI-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const generateOrderID = () =>
  "RAO-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const generateReference = (prefix = "ps") => {
  const unique = crypto.randomBytes(12).toString("hex"); // 12-char random string
  return `${prefix}_${unique}`;
};

export const handleChargeSuccess = async (eventData: PaystackEventData) => {
  let payment = null;

  try {
    payment = await Transaction.findOne({
      transactionRef: eventData.reference,
    });

    if (!payment) {
      console.log(
        "Payent not found for this transaction reference:",
        eventData.reference,
      );
      throw new Error("Payent not found");
    }

    if (payment.status === "completed") return payment;

    payment.date = new Date(eventData.paid_at);
    payment.status = "completed";
    await payment.save();

    const produce = await Produce.findById(payment.produce);

    if (!produce) {
      throw new Error("Associated produce not found");
    }

    const newInvestment = await Investment.create({
      user: payment.user,
      payment: payment._id,
      produce: payment.produce,
      orderID: generateOrderID(),
      units: eventData.metadata.units,
      title: eventData.metadata.produce_title,
      totalPrice: payment.amount,
      customerEmail: payment.userEmail,
      orderStatus: "confirmed",
      transactionRef: payment.transactionRef,
      duration: produce.duration,
      ROI: produce.ROI,
    });
    await awardReferralCommission(
      payment.user.toString(),
      newInvestment._id.toString(),
    );

    const hasActiveInvestment = await Investment.exists({
      user: payment.user,
      orderStatus: "confirmed",
      status: "ongoing",
    });

    await User.findByIdAndUpdate(payment.user, {
      hasActiveInvestment: Boolean(hasActiveInvestment),
    });

    produce.remainingUnit -= eventData.metadata.units;
    await produce.save();

    await User.findByIdAndUpdate(payment.user, {
      $set: { "active-investment": true },
    });

    const investor = await User.findById(payment.user)
      .select("firstName email")
      .lean();
    if (investor?.email) {
      void sendInvestmentPaymentEmail(
        investor.email,
        investor.firstName,
        produce.title,
        payment.amount,
      );
    }
  } catch (error: any) {
    console.error("Error updating successful payment:", error.message);
  }

  return payment;
};

export const handleChargeFailed = async (eventData: PaystackEventData) => {
  console.log("Charge failed or was abandoned for ref:", eventData.reference);

  const payment = await Transaction.findOne({
    transactionRef: eventData.reference,
  });

  if (payment && payment.status === "pending") {
    payment.status = "failed";
    await payment.save();
    console.log(`Payment ${eventData.reference} marked Failed.`);
  }
};

export const handleTransferSuccess = async (data: any) => {
  const reference = data.reference;

  const withdrawal = await Transaction.findOneAndUpdate(
    { transactionRef: reference, status: "pending" },
    { status: "completed" },
    { new: true },
  );

  if (!withdrawal) return;

  await Wallet.updateOne(
    { user: withdrawal.user },
    { $inc: { lockedBalance: -withdrawal.amount } },
  );

  const user = await User.findById(withdrawal.user)
    .select("firstName email")
    .lean();
  if (user?.email) {
    void sendWithdrawalCompletedEmail(user.email, user.firstName, withdrawal.amount);
  }
};

export const handleTransferFailed = async (data: any) => {
  const reference = data.reference;

  const withdrawal = await Transaction.findOneAndUpdate(
    { transactionRef: reference, status: "pending" },
    { status: "failed" },
    { new: true },
  );

  if (!withdrawal) return;

  await Wallet.updateOne(
    { user: withdrawal.user },
    {
      $inc: {
        lockedBalance: -withdrawal.amount,
        balance: withdrawal.amount,
      },
    },
  );
};
