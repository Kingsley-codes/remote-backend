import { buildWalletFilter } from "../utils/walletFilters.js";
import { fulfillmentStages, normalizeStage } from "../utils/productionStages.js";
import { Request, Response } from "express";
import Investment from "../models/investmentModel.js";
import {
  createRecipient,
  initiateTransfer,
  verifyTransfer,
} from "../utils/paystackUtils.js";
import BankAccount from "../models/bankAccountModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import {
  generateReference,
  handleTransferFailed,
} from "../helpers/paymentHelper.js";
import axios from "axios";
import Transaction from "../models/transactionModel.js";
import { consumeEmailOtp, issueEmailOtp } from "../services/otpService.js";
import { sendOtpEmail } from "../services/emailService.js";
import crypto from "crypto";
import { logError } from "../utils/logger.js";

const maskedBankAccount = (bank: { _id: unknown; accountName: string; accountNumber: string; bankCode: string; createdAt?: Date; updatedAt?: Date }) => ({
  _id: String(bank._id),
  accountName: bank.accountName,
  accountNumber: `******${bank.accountNumber.slice(-4)}`,
  bankCode: bank.bankCode,
  createdAt: bank.createdAt,
  updatedAt: bank.updatedAt,
});

export const getUserDashboardOverview = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized Access",
      });
    }

    const [userInvestments, wallet] = await Promise.all([
      Investment.find({ user: userId })
        .populate("produce", "produceName title category status stage image1 image2 image3 rolloverProfit tracks")
        .populate("payment", "amount status")
        .sort({ orderDate: -1 }),
      Wallet.findOne({ user: userId }),
    ]);
    const activeInvestments = userInvestments.filter(
      (investment) => investment.status === "ongoing",
    );
    const totalInvestedAmount = userInvestments.reduce(
      (total, investment) => total + investment.totalPrice,
      0,
    );
    const totalProjectedProfit = activeInvestments.reduce(
      (total, investment) =>
        total + investment.totalPrice * investment.profit / 100,
      0,
    );

    return res.json({
      success: true,
      data: {
        walletBalance: wallet?.balance ?? 0,
        userInvestments: userInvestments.map((investment) => {
          const record = investment.toObject();
          const produce = record.produce as unknown as { category?: string } | null;
          return { ...record, stage: normalizeStage(record.stage, produce?.category ?? "crops") };
        }),
        totalInvestedAmount,
        totalActiveInvestments: activeInvestments.length,
        totalProjectedProfit,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard overview",
    });
  }
};

export const getUserTransactionHistory = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // pagination
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Math.floor(Number(req.query.limit) || 10), 1), 100);
    let filter;
    try { filter = { user: userId, ...buildWalletFilter(req.query) }; }
    catch (error) { return res.status(400).json({ success: false, message: (error as Error).message }); }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate("produce", "produceName title")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const history = transactions
      .map((transaction) => {
        const produce = transaction.produce as any;

        switch (transaction.transactionType) {
          case "investment-payment":
            return {
              id: transaction._id.toString(),
              type: "investment-payment" as const,
              reference: transaction.transactionRef,
              transactionID: transaction.transactionID,
              title: "Farm investment",
              subtitle: `${produce?.produceName || produce?.title || "Farm ownership"}${
                transaction.paymentMethod
                  ? ` · ${transaction.paymentMethod}`
                  : ""
              }`,
              amount: transaction.amount,
              currency: transaction.currency,
              direction: "debit" as const,
              status: transaction.status,
              paymentMethod: transaction.paymentMethod,
              createdAt: transaction.createdAt,
            };

          case "withdrawal":
            return {
              id: transaction._id.toString(),
              type: "withdrawal" as const,
              reference: transaction.transactionRef,
              transactionID: transaction.transactionID,
              title: "Withdrawal to bank",
              subtitle: "Transfer to your linked bank account",
              amount: transaction.amount,
              currency: transaction.currency,
              direction: "debit" as const,
              status: transaction.status,
              createdAt: transaction.createdAt,
            };

          case "referral-reward":
            return {
              id: transaction._id.toString(),
              type: "referral-reward" as const,
              transactionID: transaction.transactionID,
              title: "Referral bonus",
              subtitle: `Bonus for ${
                (transaction.referredUser as any)?.firstName ||
                "a referred user"
              }`,
              amount: transaction.amount,
              currency: transaction.currency,
              direction: "credit" as const,
              status: transaction.status,
              createdAt: transaction.createdAt,
            };

          case "harvest-return":
            return {
              id: transaction._id.toString(),
              type: "harvest-return" as const,
              reference: transaction.transactionRef,
              transactionID: transaction.transactionID,
              title: "Harvest cash return",
              subtitle: produce?.produceName || produce?.title || "Farm return",
              amount: transaction.amount,
              currency: transaction.currency,
              direction: "credit" as const,
              status: transaction.status,
              createdAt: transaction.createdAt,
            };

          default:
            return null;
        }
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      data: {
        transactions: history,
        meta: { page, total, totalPages: Math.max(1, Math.ceil(total / limit)), limit },
      },
    });
  } catch (error: any) {
    logError("wallet.transaction_history_failed", error, { userId: req.user?.toString() });

    return res.status(500).json({
      success: false,
      message: "Unable to load transaction history",
    });
  }
};

export const getUserTransactionById = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ success: false, message: "Missing id" });
    }

    const transaction = await Transaction.findOne({ _id: id, user: userId })
      .populate("produce", "produceName title description price")
      .populate("referredUser", "firstName lastName email")
      .lean();

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.status(200).json({ success: true, data: { transaction } });
  } catch (error: any) {
    logError("wallet.transaction_fetch_failed", error, { userId: req.user?.toString() });
    return res.status(500).json({
      success: false,
      message: "Unable to get transaction",
    });
  }
};

export const getUserInvestments = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const userInvestments = await Investment.find({ user: userId })
      .populate("produce", "produceName title category status stage image1 image2 image3 rolloverProfit tracks")
      .populate("payment", "amount status");

    const totalInvestedAmount = userInvestments.reduce((total, investment) => {
      return total + investment.totalPrice;
    }, 0);

    const activeInvestments = userInvestments.filter(
      (investment) => investment.status === "ongoing",
    );
    const totalActiveInvestments = activeInvestments.length;
    const totalProjectedProfit = activeInvestments.reduce(
      (total, investment) =>
        total + investment.totalPrice * investment.profit / 100,
      0,
    );

    return res.status(200).json({
      success: true,
      data: {
        userInvestments: userInvestments.map((investment) => {
          const record = investment.toObject();
          const produce = record.produce as unknown as { category?: string } | null;
          return { ...record, stage: normalizeStage(record.stage, produce?.category ?? "crops") };
        }),
        totalInvestedAmount,
        totalActiveInvestments,
        totalProjectedProfit,
      },
    });
  } catch (error: any) {
    logError("investment.user_list_failed", error, { userId: req.user?.toString() });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const chooseHarvestReturn = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { investmentId } = req.params;
    const { choice } = req.body;
    const validChoices = ["physical-produce", "cash-return"];

    if (!validChoices.includes(choice)) {
      return res.status(400).json({
        success: false,
        message: "Choose either physical produce or cash return",
      });
    }

    const fulfillmentStatus =
      choice === "physical-produce" ? "pending-delivery" : "pending-approval";

    const investment = await Investment.findOneAndUpdate(
      {
        _id: investmentId,
        user: userId,
        orderStatus: "confirmed",
        status: "ongoing",
        stage: { $in: fulfillmentStages },
        harvestChoice: null,
      },
      {
        harvestChoice: choice,
        harvestFulfillmentStatus: fulfillmentStatus,
        harvestChoiceDate: new Date(),
      },
      { new: true },
    ).populate("produce", "name title stage image1 image2 image3");

    if (!investment) {
      return res.status(409).json({
        success: false,
        message:
          "Harvest choice is only available once, for confirmed farms ready for fulfillment",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Harvest return choice saved",
      data: { investment },
    });
  } catch (error: any) {
    logError("investment.harvest_choice_failed", error, { userId: req.user?.toString() });
    return res.status(500).json({
      success: false,
      message: "Unable to save harvest choice",
    });
  }
};

export const requestBankAccountOtp = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    const { accountName, accountNumber, bankCode, password } = req.body;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    if (await BankAccount.exists({ user: userId }))
      return res
        .status(409)
        .json({
          success: false,
          message:
            "A withdrawal account is already linked. Update or remove it first.",
        });
    const user = await User.findById(userId).select("+password");
    if (
      !user?.password ||
      !(await bcrypt.compare(password ?? "", user.password))
    )
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    if (!accountName || !/^\d{10}$/.test(accountNumber ?? "") || !bankCode)
      return res
        .status(400)
        .json({
          success: false,
          message: "Valid account details are required",
        });
    const code = await issueEmailOtp({
      email: user.email,
      userId: userId.toString(),
      purpose: "bank-account",
      payload: { accountName, accountNumber, bankCode },
    });
    await sendOtpEmail(user.email, code, "bank-account");
    return res
      .status(200)
      .json({
        success: true,
        message: "A verification code has been sent to your email",
      });
  } catch (err) {
    logError("bank_account.otp_request_failed", err, { userId: req.user?.toString() });
    return res
      .status(503)
      .json({ success: false, message: "Unable to send verification code" });
  }
};

export const addBankAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    const { otp } = req.body as { otp?: string };
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!otp)
      return res
        .status(400)
        .json({ success: false, message: "Verification code is required" });
    if (await BankAccount.exists({ user: userId }))
      return res
        .status(409)
        .json({
          success: false,
          message:
            "A withdrawal account is already linked. Update or remove it first.",
        });
    const user = await User.findById(userId).select("email");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    const payload = await consumeEmailOtp({
      email: user.email,
      userId: userId.toString(),
      purpose: "bank-account",
      code: otp,
    });
    if (!payload)
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid or expired verification code",
        });
    const { accountName, accountNumber, bankCode } = payload as {
      accountName: string;
      accountNumber: string;
      bankCode: string;
    };

    // 1. Create Paystack recipient
    const recipient = await createRecipient({
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
    });

    // 2. Save to DB
    const bank = await BankAccount.create({
      user: userId,
      accountName,
      accountNumber,
      bankCode,
      recipientCode: recipient.recipient_code,
    });

    return res.status(201).json({
      success: true,
      data: maskedBankAccount(bank),
    });
  } catch (err: any) {
    logError("bank_account.create_failed", err, { userId: req.user?.toString() });
    return res.status(500).json({
      success: false,
      message: "Failed to add bank account",
    });
  }
};

export const getBankAccount = async (req: Request, res: Response) => {
  const bank = await BankAccount.findOne({ user: req.user })
    .select("accountName +accountNumber bankCode createdAt updatedAt");
  return res.json({ success: true, data: bank ? maskedBankAccount(bank) : null });
};

export const updateBankAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    const { accountName, accountNumber, bankCode, password } = req.body;
    const user = await User.findById(userId).select("+password");
    if (
      !user?.password ||
      !(await bcrypt.compare(password ?? "", user.password))
    )
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    if (!accountName || !/^\d{10}$/.test(accountNumber ?? "") || !bankCode) {
      return res.status(400).json({ success: false, message: "Valid account details are required" });
    }
    const existing = await BankAccount.findOne({ user: userId }).select("+accountNumber +recipientCode");
    if (!existing)
      return res
        .status(404)
        .json({ success: false, message: "No withdrawal account found" });
    const recipient = await createRecipient({
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
    });
    existing.set({
      accountName,
      accountNumber,
      bankCode,
      recipientCode: recipient.recipient_code,
    });
    await existing.save();
    return res.json({ success: true, data: maskedBankAccount(existing) });
  } catch (err: any) {
    logError("bank_account.update_failed", err, { userId: req.user?.toString() });
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update bank account",
      });
  }
};

export const removeBankAccount = async (req: Request, res: Response) => {
  const user = await User.findById(req.user).select("+password");
  if (
    !user?.password ||
    !(await bcrypt.compare(req.body.password ?? "", user.password))
  )
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  const deleted = await BankAccount.findOneAndDelete({ user: req.user });
  if (!deleted)
    return res
      .status(404)
      .json({ success: false, message: "No withdrawal account found" });
  return res.json({ success: true });
};

export const getBanks = async (req: Request, res: Response) => {
  try {
    const response = await axios.get("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    res.json(response.data.data);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch banks",
    });
  }
};

const WITHDRAWAL_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

const isDefinitiveTransferRejection = (error: any) => {
  if (error?.definitive === true) return true;
  if (!axios.isAxiosError(error) || !error.response) return false;

  const status = error.response.status;
  const message = String(error.response.data?.message ?? "");
  if (/reference.*(already|exists)|already.*reference/i.test(message)) {
    return false;
  }

  return status >= 400 && status < 500 && ![408, 409, 429].includes(status);
};

const matchesWithdrawalRequest = (
  withdrawal: InstanceType<typeof Transaction>,
  userId: string,
  amount: number,
) =>
  withdrawal.transactionType === "withdrawal" &&
  withdrawal.user.toString() === userId &&
  withdrawal.amount === amount;

const sendWithdrawalResponse = async (
  res: Response,
  withdrawal: InstanceType<typeof Transaction>,
) => {
  let currentWithdrawal = withdrawal;

  if (
    currentWithdrawal.status === "pending" &&
    currentWithdrawal.transferInitiationStatus === "uncertain" &&
    process.env.NODE_ENV !== "development"
  ) {
    try {
      const verification = await verifyTransfer(
        currentWithdrawal.transactionRef!,
      );
      const providerStatus = String(
        verification?.data?.status ?? "",
      ).toLowerCase();

      if (["failed", "reversed"].includes(providerStatus)) {
        await handleTransferFailed({
          reference: currentWithdrawal.transactionRef,
        });
      } else if (providerStatus) {
        await Transaction.updateOne(
          { _id: currentWithdrawal._id, status: "pending" },
          { transferInitiationStatus: "submitted" },
        );
      }

      const refreshed = await Transaction.findById(currentWithdrawal._id);
      if (refreshed) currentWithdrawal = refreshed;
    } catch {
      // Keep funds locked until Paystack can be verified or sends a webhook.
    }
  }

  if (currentWithdrawal.status === "failed") {
    return res.status(409).json({
      success: false,
      message: "Withdrawal was rejected and the funds were returned",
      retryableWithNewKey: true,
      data: {
        amount: currentWithdrawal.amount,
        reference: currentWithdrawal.transactionRef,
        status: currentWithdrawal.status,
      },
    });
  }

  if (currentWithdrawal.status === "completed") {
    return res.status(200).json({
      success: true,
      message: "Withdrawal completed",
      data: {
        amount: currentWithdrawal.amount,
        reference: currentWithdrawal.transactionRef,
        status: currentWithdrawal.status,
      },
    });
  }

  return res.status(202).json({
    success: true,
    message:
      currentWithdrawal.transferInitiationStatus === "uncertain"
        ? "Withdrawal submitted; confirmation is still pending"
        : "Withdrawal is being processed",
    data: {
      amount: currentWithdrawal.amount,
      reference: currentWithdrawal.transactionRef,
      status: currentWithdrawal.status,
      initiationStatus: currentWithdrawal.transferInitiationStatus,
    },
  });
};

export const withdrawBalance = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  const withdrawalReference = generateReference();

  try {
    const userId = req.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const idempotencyKey = req.get("Idempotency-Key")?.trim();
    if (
      !idempotencyKey ||
      !WITHDRAWAL_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid Idempotency-Key header is required",
      });
    }

    const { amount: requestedAmount, password } = req.body;
    const amount = Number(requestedAmount);
    if (!Number.isSafeInteger(amount) || amount < 500) {
      return res.status(400).json({
        success: false,
        message: "Withdrawal must be a whole amount of at least ₦500",
      });
    }

    const existingWithdrawal = await Transaction.findOne({ idempotencyKey });
    if (existingWithdrawal) {
      if (
        !matchesWithdrawalRequest(
          existingWithdrawal,
          userId.toString(),
          amount,
        )
      ) {
        return res.status(409).json({
          success: false,
          message: "This idempotency key was already used for another request",
        });
      }
      return sendWithdrawalResponse(res, existingWithdrawal);
    }

    let withdrawalId: string | null = null;
    let bankRecipientCode = "";

    try {
      await session.withTransaction(async () => {
        const user = await User.findById(userId)
          .select("+password")
          .session(session);
        if (!user || !user.password) throw new Error("User not found");
        if (!(await bcrypt.compare(password, user.password))) {
          throw new Error("Invalid credentials");
        }

        const bankDetails = await BankAccount.findOne({ user: userId })
          .select("+recipientCode")
          .session(session);
        if (!bankDetails) throw new Error("No bank account found");
        bankRecipientCode = bankDetails.recipientCode;

        const wallet = await Wallet.findOneAndUpdate(
          { user: userId, balance: { $gte: amount } },
          { $inc: { balance: -amount, lockedBalance: amount } },
          { new: true, session },
        );
        if (!wallet) {
          throw new Error("Insufficient balance or concurrent withdrawal");
        }

        const requestHash = crypto
          .createHash("sha256")
          .update(`${userId.toString()}:${amount}`)
          .digest("hex");
        const withdrawal = new Transaction({
          user: userId,
          transactionType: "withdrawal",
          transactionID: withdrawalReference,
          amount,
          status: "pending",
          transactionRef: withdrawalReference,
          idempotencyKey,
          idempotencyRequestHash: requestHash,
          transferInitiationStatus: "processing",
          transferRecipientCode: bankRecipientCode,
        });
        await withdrawal.save({ session });
        withdrawalId = withdrawal._id.toString();
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await Transaction.findOne({ idempotencyKey });
        if (existing) {
          if (
            !matchesWithdrawalRequest(existing, userId.toString(), amount)
          ) {
            return res.status(409).json({
              success: false,
              message:
                "This idempotency key was already used for another request",
            });
          }
          return sendWithdrawalResponse(res, existing);
        }
      }
      throw error;
    }

    try {
      const transfer = await initiateTransfer({
        amount,
        recipient: bankRecipientCode,
        reference: withdrawalReference,
      });
      const updatedWithdrawal = await Transaction.findOneAndUpdate(
        { _id: withdrawalId, status: "pending" },
        {
          transactionRef: transfer.reference,
          transferInitiationStatus: "submitted",
        },
        { new: true },
      );
      if (updatedWithdrawal) {
        return sendWithdrawalResponse(res, updatedWithdrawal);
      }
      const settledWithdrawal = await Transaction.findById(withdrawalId);
      if (settledWithdrawal) {
        return sendWithdrawalResponse(res, settledWithdrawal);
      }
      throw new Error("Withdrawal record not found");
    } catch (error: any) {
      if (isDefinitiveTransferRejection(error)) {
        await handleTransferFailed({ reference: withdrawalReference });
        const failedWithdrawal = await Transaction.findById(withdrawalId);
        if (failedWithdrawal) {
          return sendWithdrawalResponse(res, failedWithdrawal);
        }
      }

      const uncertainWithdrawal = await Transaction.findOneAndUpdate(
        { _id: withdrawalId, status: "pending" },
        { transferInitiationStatus: "uncertain" },
        { new: true },
      );
      if (uncertainWithdrawal) {
        return sendWithdrawalResponse(res, uncertainWithdrawal);
      }
      const settledWithdrawal = await Transaction.findById(withdrawalId);
      if (settledWithdrawal) {
        return sendWithdrawalResponse(res, settledWithdrawal);
      }
      throw error;
    }
  } catch (error: any) {
    logError("withdrawal.request_failed", error, { userId: req.user?.toString() });
    return res.status(400).json({
      success: false,
      message: "Unable to process withdrawal",
    });
  } finally {
    await session.endSession();
  }
};
