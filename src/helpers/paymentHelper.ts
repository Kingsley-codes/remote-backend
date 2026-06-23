import crypto from "crypto";
import Payment from "../models/paymentModel.js";
import { PaystackEventData } from "../interface/allInterfaces.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import Withdrawal from "../models/withdrawalModel.js";
import Wallet from "../models/walletModel.js";

// Helper function to generate unique IDs
export const generatePaymentID = () =>
  "GRI-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const generateOrderID = () =>
  "GRO-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const generateReference = (prefix = "ps") => {
  const unique = crypto.randomBytes(12).toString("hex"); // 12-char random string
  return `${prefix}_${unique}`;
};

export const handleChargeSuccess = async (eventData: PaystackEventData) => {
  let payment = null;

  try {
    payment = await Payment.findOne({
      transactionRef: eventData.reference,
    });

    if (!payment) {
      console.log(
        "Payent not found for this transaction reference:",
        eventData.reference,
      );
      throw new Error("Payent not found");
    }

    payment.date = new Date(eventData.paid_at);
    payment.paymentStatus = "Completed";
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

    produce.remainingUnit -= eventData.metadata.units;
    await produce.save();

    // Send notification email
    //     await sendDonationAcknowledgement(donation)
  } catch (error: any) {
    console.error("Error updating successful payment:", error.message);
  }

  return payment;
};

export const handleChargeFailed = async (eventData: PaystackEventData) => {
  console.log("Charge failed or was abandoned for ref:", eventData.reference);

  const payment = await Payment.findOne({
    transactionRef: eventData.reference,
  });

  if (payment && payment.paymentStatus === "Pending") {
    payment.paymentStatus = "Failed";
    await payment.save();
    console.log(`Payment ${eventData.reference} marked Failed.`);
  }
};

export const handleTransferSuccess = async (data: any) => {
  const reference = data.reference;

  const withdrawal = await Withdrawal.findOneAndUpdate(
    { reference, status: "pending" },
    { status: "success" },
    { new: true },
  );

  if (!withdrawal) return;

  await Wallet.updateOne(
    { user: withdrawal.user },
    { $inc: { lockedBalance: -withdrawal.amount } },
  );
};

export const handleTransferFailed = async (data: any) => {
  const reference = data.reference;

  const withdrawal = await Withdrawal.findOneAndUpdate(
    { reference, status: "pending" },
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
