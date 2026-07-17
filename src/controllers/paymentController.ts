import { Request, Response } from "express";
import User from "../models/userModel.js";
import {
  generatePaymentID,
  generateOrderID,
  generateReference,
  handleChargeFailed,
  handleChargeSuccess,
  handleTransferSuccess,
  handleTransferFailed,
} from "../helpers/paymentHelper.js";
import {
  initializePaystackTransaction,
  verifyTransaction,
} from "../utils/paystackUtils.js";
import Payment from "../models/paymentModel.js";
import crypto from "crypto";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import Wallet from "../models/walletModel.js";
import mongoose from "mongoose";
import { generateUSerID } from "./authControllers.js";
import { awardReferralCommission } from "../services/referralService.js";

const handleWalletPayment = async (
  userId: string,
  amount: number,
  email: string,
  produceId: string,
  produceTitle: string,
  units: number,
  duration: number,
  ROI: number,
) => {
  const session = await mongoose.startSession();

  try {
    const userWallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: -Number(amount) } },
      { new: true, session },
    );

    if (!userWallet) {
      throw new Error("User wallet not found");
    }

    // Prevent negative balance
    if (userWallet.balance < 0) {
      throw new Error("Insufficient wallet balance");
    }

    const paymentID = generatePaymentID();

    const newPayment = new Payment({
      user: userId,
      paymentID: paymentID,
      produce: produceId,
      userEmail: email,
      amount: amount,
      paymentMethod: "wallet",
      paymentStatus: "Completed",
    });

    await newPayment.save({ session });

    const newInvestment = new Investment({
        user: userId,
        produce: produceId,
        orderID: generateOrderID(),
        payment: newPayment._id!,
        title: produceTitle,
        units: units,
        totalPrice: amount,
        orderStatus: "confirmed",
        customerEmail: email,
        duration: duration,
        ROI: ROI,
      });
    await newInvestment.save({ session });
    await awardReferralCommission(userId, newInvestment._id.toString(), session);

    // 5️⃣ Commit transaction
    await session.commitTransaction();
    session.endSession();

    return {
      paymentID,
      newInvestment,
    };
  } catch (error) {
    // ❌ Rollback everything
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const initializePayment = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      lastName,
      firstName,
      address,
      paymentMethod,
      email,
      produceId,
      amount,
      units,
    } = req.body;

    if (!paymentMethod || !amount || !produceId || !units) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: units, produceId, paymentMethod, amount",
      });
    }

    if (!userId && (!lastName || !firstName || !email || !address)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: lastName, firstName, email, address",
      });
    }

    if (userId) {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account not found",
        });
      }
    }

    let finalUserId;

    if (!userId) {
      const newUser = await User.create({
        firstName,
        lastName,
        email,
        farmerID: generateUSerID(),
        address,
      });

      finalUserId = newUser._id;
    } else {
      finalUserId = userId;
    }

    const produce = await Produce.findById(produceId);

    if (!produce) {
      return res.status(404).json({
        success: false,
        message: "Produce not found",
      });
    }

    const expectedAmount = produce.price * units;

    if (Number(amount) !== expectedAmount) {
      return res.status(400).json({
        success: false,
        message: "Amount does not match expected value",
      });
    }

    if (paymentMethod === "wallet") {
      try {
        const { paymentID, newInvestment } = await handleWalletPayment(
          userId,
          amount,
          email,
          produceId,
          produce.title,
          units,
          produce.duration,
          produce.ROI,
        );

        return res.status(200).json({
          success: true,
          message: "Payment successful using wallet",
          data: {
            paymentID,
            newInvestment,
          },
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          message: "Failed to process wallet payment",
          error: error.message,
        });
      }
    } else {
      const userName = firstName + " " + lastName;

      const amountKobo = Math.round(Number(amount) * 100);

      const paymentID = generatePaymentID();

      const transactionData = {
        email: email,
        amount: amountKobo,
        reference: generateReference(),
        metadata: {
          user_id: finalUserId,
          user_name: userName,
          user_email: email,
          produce_id: produceId,
          amount: amount,
          units: units,
          payment_id: paymentID,
          produce_title: produce.title,
          custom_fields: [
            {
              display_name: "User Name",
              variable_name: "user_name",
              value: userName,
            },
            {
              display_name: "Produce Title",
              variable_name: "produce_title",
              value: produce.title,
            },
            {
              display_name: "Amount",
              variable_name: "amount",
              value: amount,
            },
          ],
        },

        callback_url: `${process.env.FRONTEND_URL}/checkout/verifyPayment`,
        // callback_url: "http://localhost:3000/checkout/verifyPayment",
      };

      // Call Paystack API
      const paystackResponse =
        await initializePaystackTransaction(transactionData);

      if (!paystackResponse.status || !("data" in paystackResponse)) {
        return res.status(400).json({
          success: false,
          message: "Failed to initialize transaction",
          error: paystackResponse.message,
          reference: transactionData.reference,
        });
      }

      const payment = await Payment.create({
        user: finalUserId,
        paymentID: paymentID,
        userEmail: email,
        produce: produceId,
        amount: amount,
        paymentMethod: paymentMethod,
        transactionRef: paystackResponse.data.reference,
      });

      // Return success response
      return res.status(200).json({
        success: true,
        message: "Transaction initialized successfully",
        data: {
          authorization_url: paystackResponse.data.authorization_url,
          access_code: paystackResponse.data.access_code,
          reference: paystackResponse.data.reference,
          paymentID: payment.paymentID,
        },
      });
    }
  } catch (error: any) {
    console.log("Error initializing payment:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const verifyPayment = async (
  req: Request<{ reference: string }>,
  res: Response,
) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference is required",
      });
    }

    // Call Paystack Verify API
    const verificationResponse = await verifyTransaction(reference);

    if (!verificationResponse.status) {
      return res.status(400).json({
        success: false,
        message: "Transaction verification failed",
        error: verificationResponse.message,
      });
    }

    const transactionData = verificationResponse.data;

    // Find donation record by transactionRef
    const payment = await Payment.findOne({ transactionRef: reference });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // If cancelled already, don't proceed
    if (payment.paymentStatus === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Transaction was already marked as cancelled",
        status: payment.paymentStatus,
      });
    }

    // If failed → mark failed
    if (transactionData.status === "failed") {
      payment.paymentStatus = "Failed";
      await payment.save();

      return res.status(404).json({
        success: false,
        message: "Payment failed",
      });
    }

    // ✅ Only proceed if Paystack says it's successful
    if (transactionData.status === "success") {
      if (payment.paymentStatus === "Completed") {
        // ✅ Handle second verification attempt gracefully

        const investment = await Investment.findOne({ payment: payment._id });

        return res.status(200).json({
          success: true,
          message: "Transaction already verified",
          data: {
            paymentID: payment.paymentID,
            userEmail: payment.userEmail,
            amount: payment.amount,
            investment,
          },
        });
      }

      payment.paymentStatus = "Completed";
      payment.date = new Date();

      await payment.save();

      const produce = await Produce.findById(payment.produce);

      if (!produce) {
        return res.status(404).json({
          success: false,
          message: "Associated produce not found",
        });
      }

      const newInvestment = await Investment.create({
        user: payment.user,
        payment: payment._id,
        orderID: generateOrderID(),
        produce: payment.produce,
        units: transactionData.metadata.units,
        title: transactionData.metadata.produce_title,
        totalPrice: payment.amount,
        customerEmail: payment.userEmail,
        orderStatus: "confirmed",
        transactionRef: payment.transactionRef,
        duration: produce.duration,
        ROI: produce.ROI,
      });
      await awardReferralCommission(payment.user.toString(), newInvestment._id.toString());

      produce.remainingUnit -= transactionData.metadata.units;
      await produce.save();

      return res.status(200).json({
        success: true,
        message: "Transaction verified successfully",
        data: {
          paymentID: payment.paymentID,
          userEmail: payment.userEmail,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          newInvestment,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: "Transaction not successful",
      status: transactionData.status,
    });
  } catch (error: any) {
    console.error("Verify transaction error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Handle webhook from Paystack (idempotent, final source of truth)
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(400).send("No signature");
    }

    if (!secret) {
      return res.status(500).send("Paystack secret key not configured");
    }

    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    const eventData = event.data;

    console.log(`Received Webhook Event: ${event.event}`, eventData.reference);

    // Acknowledge receipt immediately to prevent Paystack retries
    res.sendStatus(200);

    // Process the event asynchronously after acknowledging
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(event.data);
        break;

      case "charge.failed":
      case "charge.abandoned":
        await handleChargeFailed(event.data);
        break;

      case "transfer.success":
        await handleTransferSuccess(event.data);
        break;

      case "transfer.failed":
        await handleTransferFailed(event.data);
        break;

      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    return res;
  } catch (error) {
    // IMPORTANT: We already sent a 200, so we can only log the error.
    console.error("Error in async webhook processing:", error);

    // If something fails before we sent 200
    return res.status(500).send("Webhook processing error");
  }
};
