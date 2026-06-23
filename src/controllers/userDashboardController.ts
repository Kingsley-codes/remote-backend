import { Request, Response } from "express";
import Investment from "../models/investmentModel.js";
import { createRecipient, initiateTransfer } from "../utils/paystackUtils.js";
import BankAccount from "../models/bankAccountModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import Withdrawal from "../models/withdrawalModel.js";
import { generateReference } from "../helpers/paymentHelper.js";
import axios from "axios";

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
      .populate("produce", "name stage image1 image2 image3")
      .populate("payment", "amount status");

    const totalInvestedAmount = userInvestments.reduce((total, investment) => {
      return total + investment.totalPrice;
    }, 0);

    const totalActiveInvestments = userInvestments.filter(
      (investment) => investment.status === "ongoing",
    ).length;

    const totalProjectedROI = userInvestments.reduce((total, investment) => {
      if (investment.status === "ongoing") {
        const roi = (investment.totalPrice * 0.1) / investment.duration;
        return total + roi;
      }
      return total;
    }, 0);

    return res.status(200).json({
      success: true,
      data: {
        userInvestments,
        totalInvestedAmount,
        totalActiveInvestments,
        totalProjectedROI,
      },
    });
  } catch (error: any) {
    console.error("Error fetching user investments:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const addBankAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { accountName, accountNumber, bankCode, password } = req.body;

    const user = await User.findById(userId).select("+password");
    if (!user || !user.password) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

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
      data: bank,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.response?.data || "Failed to add bank",
    });
  }
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

export const withdrawBalance = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  let withdrawalId: string | null = null;
  let bankRecipientCode: string = "";
  let amount: number;

  const withdrawalReference = generateReference();

  try {
    const userId = req.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { amount: reqAmount, password } = req.body;
    amount = reqAmount;

    if (amount < 500) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal is ₦500",
      });
    }

    // STEP 1: DB TRANSACTION ONLY
    await session.withTransaction(async () => {
      // 1. Validate password
      const user = await User.findById(userId)
        .select("+password")
        .session(session);

      if (!user || !user.password) {
        throw new Error("User not found");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        throw new Error("Invalid credentials");
      }

      // 2. Get bank account
      const bankDetails = await BankAccount.findOne({ user: userId }).session(
        session,
      );

      if (!bankDetails) {
        throw new Error("No bank account found");
      }

      bankRecipientCode = bankDetails.recipientCode;

      // 3. Atomic wallet update
      const wallet = await Wallet.findOneAndUpdate(
        {
          user: userId,
          balance: { $gte: amount },
        },
        {
          $inc: {
            balance: -amount,
            lockedBalance: amount,
          },
        },
        { new: true, session },
      );

      if (!wallet) {
        throw new Error("Insufficient balance or concurrent withdrawal");
      }

      // 4. Create withdrawal (PENDING)
      const withdrawal = new Withdrawal({
        user: userId,
        amount,
        status: "pending",
        reference: withdrawalReference,
      });

      await withdrawal.save({ session });

      withdrawalId = withdrawal._id.toString();
    });

    // STEP 2: CALL PAYSTACK (OUTSIDE TXN)
    try {
      const transfer = await initiateTransfer({
        amount,
        recipient: bankRecipientCode,
        reference: withdrawalReference,
      });

      // Save reference (DO NOT mark success yet)
      await Withdrawal.updateOne(
        { _id: withdrawalId },
        { reference: transfer.reference },
      );

      return res.json({
        success: true,
        message: "Withdrawal initiated successfully",
        data: {
          amount: amount,
          recipient: bankRecipientCode,
          reference: withdrawalReference,
        },
      });
    } catch (err: any) {
      if (err.response) {
        console.log("Paystack Error:", err.response.data);
      } else {
        console.log(err);
      }
      // STEP 3: PAYSTACK FAILED → ROLLBACK
      await Wallet.updateOne(
        { user: userId },
        {
          $inc: {
            lockedBalance: -amount,
            balance: amount,
          },
        },
      );

      await Withdrawal.updateOne({ _id: withdrawalId }, { status: "failed" });

      return res.status(500).json({
        success: false,
        message: "Transfer initiation failed",
      });
    }
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  } finally {
    session.endSession();
  }
};
