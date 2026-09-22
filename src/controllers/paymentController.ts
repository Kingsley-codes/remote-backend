import { normalizeStage } from "../utils/productionStages.js";
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
import crypto from "crypto";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import Wallet from "../models/walletModel.js";
import mongoose from "mongoose";
import { generateUSerID } from "./authControllers.js";
import { awardReferralCommission } from "../services/referralService.js";
import Transaction from "../models/transactionModel.js";
import { sendInvestmentPaymentEmail } from "../services/emailService.js";
import validator from "validator";
import { logError, logInfo } from "../utils/logger.js";
import { getTrackSchedule } from "../utils/investmentTracks.js";

const syncUserActiveInvestmentStatus = async (
  userId: string,
  session?: mongoose.ClientSession,
) => {
  const investmentQuery = Investment.exists({
    user: userId,
    orderStatus: "confirmed",
    status: "ongoing",
  });
  if (session) investmentQuery.session(session);
  const hasActiveInvestment = await investmentQuery;

  await User.findByIdAndUpdate(
    userId,
    { hasActiveInvestment: Boolean(hasActiveInvestment) },
    session ? { session } : undefined,
  );

  return Boolean(hasActiveInvestment);
};

const handleWalletPayment = async (
  userId: string,
  amount: number,
  email: string,
  produceId: string,
  units: number,
  trackId: string,
  startsAt: Date,
  endsAt: Date,
  idempotencyKey: string,
  idempotencyRequestHash: string,
  rolloverInvestmentId?: string,
) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const produce = await Produce.findOneAndUpdate(
      {
        _id: produceId,
        status: { $nin: ['suspended', 'sold out'] },
        remainingUnit: { $gte: units },
        minimumUnit: { $lte: units },
        tracks: { $elemMatch: { _id: trackId, status: { $ne: 'closed' } } },
      },
      { $inc: { remainingUnit: -units } },
      { new: true, session },
    );
    if (!produce) throw new Error("OPPORTUNITY_UNAVAILABLE");
    const track = produce.tracks.find((item) => String(item._id) === trackId);
    if (!track) throw new Error('TRACK_NOT_FOUND');
    if (track.status === 'closed') throw new Error('TRACK_CLOSED');

    let rolloverSource = null;
    if (rolloverInvestmentId) {
      rolloverSource = await Investment.findOne({
        _id: rolloverInvestmentId,
        user: userId,
        produce: produceId,
        status: "completed",
        harvestChoice: "cash-return",
        cashReturnApprovedAt: { $exists: true },
        rolledOverTo: { $exists: false },
      }).session(session);
      if (!rolloverSource) throw new Error("ROLLOVER_NOT_ELIGIBLE");
    }

    const userWallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, session },
    );
    if (!userWallet) throw new Error("INSUFFICIENT_WALLET_BALANCE");

    const paymentID = generatePaymentID();
    const newPayment = await Transaction.create([{
      user: userId,
      transactionType: "investment-payment",
      transactionID: paymentID,
      paymentID,
      produce: produceId,
      trackId,
      startsAt,
      endsAt,
      rolloverInvestment: rolloverSource?._id,
      userEmail: email,
      amount,
      units,
      paymentMethod: "wallet",
      status: "completed",
      idempotencyKey,
      idempotencyRequestHash,
    }], { session });

    const newInvestment = await Investment.create([{
      user: userId,
      produce: produceId,
      orderID: generateOrderID(),
      payment: newPayment[0]!._id,
      title: produce.title,
      units,
      totalPrice: amount,
      orderStatus: "confirmed",
      customerEmail: email,
      duration: produce.duration,
      profit: rolloverSource ? produce.rolloverProfit : produce.profit,
      stage: normalizeStage(track.stage, produce.category),
      track: { id: track._id, name: track.name, startMonth: track.startMonth, endMonth: track.endMonth },
      startsAt,
      endsAt,
      isRollover: Boolean(rolloverSource),
      rolledOverFrom: rolloverSource?._id,
    }], { session });

    if (rolloverSource) {
      rolloverSource.rolledOverTo = newInvestment[0]!._id;
      rolloverSource.rolledOverAt = new Date();
      await rolloverSource.save({ session });
    }
    await syncUserActiveInvestmentStatus(userId, session);
    await awardReferralCommission(userId, newInvestment[0]!._id.toString(), session);
    await session.commitTransaction();
    return { paymentID, newInvestment: newInvestment[0]! };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

const paymentRequestHash = (input: {
  userId: string;
  produceId: string;
  amount: number;
  units: number;
  paymentMethod: string;
  trackId: string;
  rolloverInvestmentId?: string;
}) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");

const sendExistingInitialization = async (
  res: Response,
  payment: InstanceType<typeof Transaction>,
  requestHash: string,
) => {
  if (payment.idempotencyRequestHash !== requestHash) {
    return res.status(409).json({
      success: false,
      message: "This idempotency key was already used for a different payment",
    });
  }

  if (payment.paymentMethod === "wallet") {
    const investment = await Investment.findOne({ payment: payment._id });
    if (!investment) {
      return res.status(409).json({
        success: false,
        message: "Payment is still being processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment already completed using wallet",
      data: { paymentID: payment.paymentID, newInvestment: investment },
    });
  }

  if (
    payment.initializationStatus === "initialized" &&
    payment.authorizationUrl &&
    payment.accessCode
  ) {
    return res.status(200).json({
      success: true,
      message: "Transaction already initialized",
      data: {
        authorization_url: payment.authorizationUrl,
        access_code: payment.accessCode,
        reference: payment.transactionRef,
        paymentID: payment.paymentID,
      },
    });
  }

  if (payment.initializationStatus === "failed") {
    return res.status(502).json({
      success: false,
      message: "Payment provider initialization previously failed",
      retryableWithNewKey: true,
    });
  }

  return res.status(409).json({
    success: false,
    message: "Payment initialization is still being processed",
  });
};

export const initializePayment = async (req: Request, res: Response) => {
  try {
    const idempotencyKey = req.get("Idempotency-Key")?.trim();
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        message: "A valid Idempotency-Key header is required",
      });
    }

    const {
      lastName,
      firstName,
      address,
      paymentMethod,
      email: requestedEmail,
      produceId,
      amount,
      units,
      trackId,
      rolloverInvestmentId,
    } = req.body;
    let userId = req.user?.toString();

    if (!paymentMethod || !amount || !produceId || !units || !trackId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: units, produceId, trackId, paymentMethod, amount",
      });
    }
    const numericAmount = Number(amount);
    const numericUnits = Number(units);
    if (
      !Number.isFinite(numericAmount) || numericAmount <= 0 ||
      !Number.isSafeInteger(numericUnits) || numericUnits <= 0
    ) {
      return res.status(400).json({ success: false, message: "Invalid payment amount or investment units" });
    }
    if (rolloverInvestmentId && paymentMethod !== "wallet") {
      return res.status(400).json({ success: false, message: "Rollover investments must be paid from your Agro Wallet" });
    }
    if (paymentMethod !== "card" && paymentMethod !== "wallet") {
      return res.status(400).json({ success: false, message: "Unsupported payment method" });
    }
    if (paymentMethod === "wallet" && !userId) {
      return res.status(401).json({ success: false, message: "Sign in to pay with your Agro Wallet" });
    }

    let user;
    if (userId) {
      user = await User.findOne({ _id: userId, status: "active" });
      if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
    } else {
      const email = String(requestedEmail ?? "").trim().toLowerCase();
      if (!firstName || !lastName || !address || !validator.isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "First name, last name, address, and a valid email are required for guest checkout",
        });
      }

      user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email,
          address: String(address).trim(),
          farmerID: generateUSerID(),
        });
      }
      if (user.status !== "active") {
        return res.status(403).json({ success: false, message: "This account is not available for checkout" });
      }
      userId = user._id.toString();
    }

    const finalUserId = user._id;
    const finalUserIdString = user._id.toString();
    const { email, firstName: userFirstName, lastName: userLastName } = user;

    const requestHash = paymentRequestHash({
      userId: finalUserIdString,
      produceId,
      amount: numericAmount,
      units: numericUnits,
      paymentMethod,
      trackId: String(trackId),
      ...(rolloverInvestmentId ? { rolloverInvestmentId: String(rolloverInvestmentId) } : {}),
    });
    const existingPayment = await Transaction.findOne({ idempotencyKey });
    if (existingPayment) {
      return sendExistingInitialization(res, existingPayment, requestHash);
    }

    const produce = await Produce.findById(produceId);

    if (!produce) {
      return res.status(404).json({
        success: false,
        message: "Produce not found",
      });
    }

    const track = produce.tracks.find((item) => String(item._id) === String(trackId));
    if (!track) return res.status(404).json({ success: false, message: 'Track not found' });
    if (track.status === 'closed') {
      return res.status(409).json({ success: false, code: 'TRACK_CLOSED', message: 'This track is closed to new investments' });
    }
    const schedule = getTrackSchedule(track.startMonth, produce.duration);
    if (produce.status === 'suspended' || produce.status === 'sold out') {
      return res.status(409).json({ success: false, message: "This opportunity is closed to new investments" });
    }

    if (numericUnits < produce.minimumUnit || numericUnits > produce.remainingUnit) {
      return res.status(400).json({ success: false, message: "Requested units are not available" });
    }

    const expectedAmount = produce.price * numericUnits;

    if (numericAmount !== expectedAmount) {
      return res.status(400).json({
        success: false,
        message: "Amount does not match expected value",
      });
    }

    if (paymentMethod === "wallet") {
      try {
        const { paymentID, newInvestment } = await handleWalletPayment(
          finalUserIdString,
          numericAmount,
          email,
          produceId,
          numericUnits,
          String(track._id),
          schedule.startDate,
          schedule.endDate,
          idempotencyKey,
          requestHash,
          rolloverInvestmentId ? String(rolloverInvestmentId) : undefined,
        );
        void sendInvestmentPaymentEmail(
          email,
          userFirstName || "Investor",
          produce.title,
          numericAmount,
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
        if (error?.code === 11000) {
          const existing = await Transaction.findOne({ idempotencyKey });
          if (existing) {
            return sendExistingInitialization(res, existing, requestHash);
          }
        }
        const messages: Record<string, string> = {
          INSUFFICIENT_WALLET_BALANCE: "Insufficient Agro Wallet balance",
          ROLLOVER_NOT_ELIGIBLE: "This investment is not eligible for rollover",
          OPPORTUNITY_UNAVAILABLE: "This opportunity is closed or the requested units are unavailable",
          TRACK_NOT_FOUND: "Track not found",
        };
        const message = messages[error?.message];
        return res.status(message ? 409 : 500).json({
          success: false,
          message: message ?? "Failed to process wallet payment",
          error: "Payment could not be completed",
        });
      }
    } else {
      const userName = `${userFirstName} ${userLastName}`;

      const amountKobo = Math.round(numericAmount * 100);

      const paymentID = generatePaymentID();
      const reference = generateReference();

      let payment;
      try {
        payment = await Transaction.create({
          user: finalUserId,
          transactionType: "investment-payment",
          transactionID: paymentID,
          paymentID,
          userEmail: email,
          produce: produceId,
          trackId: track._id,
          startsAt: schedule.startDate,
          endsAt: schedule.endDate,
          amount: numericAmount,
          units: numericUnits,
          paymentMethod,
          transactionRef: reference,
          idempotencyKey,
          idempotencyRequestHash: requestHash,
          initializationStatus: "processing",
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          const existing = await Transaction.findOne({ idempotencyKey });
          if (existing) {
            return sendExistingInitialization(res, existing, requestHash);
          }
        }
        throw error;
      }

      const transactionData = {
        email: email,
        amount: amountKobo,
        reference,
        metadata: {
          user_id: finalUserId,
          user_name: userName,
          user_email: email,
          produce_id: produceId,
          track_id: String(track._id),
          amount: numericAmount,
          units: numericUnits,
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
              value: numericAmount,
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
        payment.initializationStatus = "failed";
        await payment.save();
        return res.status(502).json({
          success: false,
          message: "Failed to initialize transaction",
          reference: transactionData.reference,
          retryableWithNewKey: true,
        });
      }

      payment.transactionRef = paystackResponse.data.reference;
      payment.authorizationUrl = paystackResponse.data.authorization_url;
      payment.accessCode = paystackResponse.data.access_code;
      payment.initializationStatus = "initialized";
      await payment.save();

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
    logError("payment.initialize_failed", error);

    return res.status(500).json({
      success: false,
      message: "Unable to initialize payment",
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
      });
    }

    const transactionData = verificationResponse.data;

    // Find donation record by transactionRef
    const payment = await Transaction.findOne({
      transactionRef: reference,
      ...(req.user ? { user: req.user } : {}),
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // If cancelled already, don't proceed
    if (payment.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Transaction was already marked as cancelled",
        status: payment.status,
      });
    }

    // If failed •†’ mark failed
    if (transactionData.status === "failed") {
      payment.status = "failed";
      await payment.save();

      return res.status(404).json({
        success: false,
        message: "Payment failed",
      });
    }

    // •œ… Only proceed if Paystack says it's successful
    if (transactionData.status === "success") {
      const result = await handleChargeSuccess(transactionData);
      const settledPayment = result.payment;
      if (!settledPayment || !result.investment) {
        throw new Error("Payment settlement did not complete");
      }
      return res.status(200).json({
        success: true,
        message: result.newlySettled
          ? "Transaction verified successfully"
          : "Transaction already verified",
        data: {
          paymentID: settledPayment.paymentID,
          userEmail: settledPayment.userEmail,
          amount: settledPayment.amount,
          paymentMethod: settledPayment.paymentMethod,
          newInvestment: result.investment,
        },
      });

    }

    return res.status(400).json({
      success: false,
      message: "Transaction not successful",
      status: transactionData.status,
    });
  } catch (error: any) {
    logError("payment.verify_failed", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
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
      return res.status(503).send("Payment service unavailable");
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) return res.status(400).send("Invalid webhook payload");
    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    if (
      typeof signature !== "string" ||
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
    ) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    const eventData = event.data;

    logInfo("paystack.webhook_received", { eventType: String(event.event), reference: String(eventData.reference) });

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
        logInfo("paystack.webhook_ignored", { eventType: String(event.event) });
    }

    return res.sendStatus(200);
  } catch (error) {
    logError("paystack.webhook_failed", error);
    return res.status(500).send("Webhook processing error");
  }
};
