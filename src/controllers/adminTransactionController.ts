import type { Request, Response } from "express";
import mongoose, { type FilterQuery } from "mongoose";
import Transaction from "../models/transactionModel.js";
import User from "../models/userModel.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import { withdrawalPeriod } from "../utils/withdrawalPeriod.js";
import { logError } from "../utils/logger.js";

const personFields = "firstName lastName email farmerID";
const investmentFields = "orderID title produce units totalPrice profit referralBonus duration track startsAt endsAt orderStatus status stage harvestChoice harvestFulfillmentStatus harvestChoiceDate harvestDeliveredAt cashReturnApprovedAt cashReturnAmount isRollover rolledOverFrom rolledOverTo orderDate";
const privateFields = "-idempotencyKey -idempotencyRequestHash -authorizationUrl -accessCode -__v";
const str = (value: unknown) => typeof value === "string" ? value : undefined;

export async function getAdminTransactions(req: Request, res: Response) {
  try {
    const filter: FilterQuery<typeof Transaction.prototype> = {};
    for (const [key, allowed] of Object.entries({
      transactionType: ["investment-payment", "withdrawal", "referral-reward", "harvest-return"],
      status: ["pending", "completed", "refunded", "cancelled", "failed"],
      paymentMethod: ["card", "bank", "wallet"],
    })) {
      const value = str(req.query[key]);
      if (value && value !== "all") {
        if (!allowed.includes(value)) return res.status(400).json({ message: `Invalid ${key}` });
        filter[key] = value;
      }
    }
    try {
      Object.assign(filter, withdrawalPeriod(str(req.query.period), str(req.query.startDate), str(req.query.endDate)));
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid period" });
    }
    const produce = str(req.query.produce);
    if (produce && produce !== "all") {
      if (!mongoose.isObjectIdOrHexString(produce)) return res.status(400).json({ message: "Invalid produce" });
      // Referral rewards store their produce on the qualifying investment.
      const investments = await Investment.find({ produce }).select("_id").lean();
      filter.$and = [{ $or: [{ produce }, { referralRewardInvestment: { $in: investments.map(item => item._id) } }] }];
    }
    const query = str(req.query.q)?.trim().slice(0, 200);
    if (query) {
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const users = await User.find({ $or: ["firstName", "lastName", "email", "farmerID"].map(key => ({ [key]: regex })) }).select("_id").lean();
      filter.$or = ["transactionID", "transactionRef", "paymentID", "userEmail"].map(key => ({ [key]: regex }));
      filter.$or.push({ user: { $in: users.map(user => user._id) } });
    }
    const page = Number(str(req.query.page) ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return res.status(400).json({ message: "Invalid page" });
    const limit = 10;
    const [data, total, produces] = await Promise.all([
      Transaction.find(filter).select("transactionID transactionType amount currency status createdAt paymentMethod user userEmail produce referralRewardInvestment")
        .populate("user", personFields).populate("produce", "produceName title")
        .populate({ path: "referralRewardInvestment", select: "produce", populate: { path: "produce", select: "produceName title" } })
        .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transaction.countDocuments(filter),
      Produce.find().select("produceName title").sort({ produceName: 1 }).lean(),
    ]);
    return res.json({ success: true, data, produces, pagination: { page, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    logError("admin.transactions_list_failed", error);
    return res.status(500).json({ message: "Unable to load transactions" });
  }
}

export async function getAdminTransactionDetails(req: Request, res: Response) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: "Invalid transaction ID" });
    const transaction = await Transaction.findById(req.params.id).select(`+withdrawalBankAccount ${privateFields}`)
      .populate("user", personFields).populate("referredUser", personFields)
      .populate("produce", "produceName title produceID tracks")
      .populate("approvedBy initiatedByAdmin", "firstName lastName")
      .populate({ path: "referralRewardInvestment rolloverInvestment", select: investmentFields, populate: { path: "produce", select: "produceName title produceID" } }).lean();
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    const produce = transaction.produce as unknown as { _id: mongoose.Types.ObjectId; tracks?: Array<{ _id: mongoose.Types.ObjectId; name: string; startMonth: number; endMonth: number }> } | null;
    const investment = transaction.transactionType === "investment-payment"
      ? await Investment.findOne({ payment: String(transaction._id) }).select(investmentFields).lean()
      : transaction.transactionType === "harvest-return" && transaction.user && transaction.produce
        ? await Investment.findOne({ user: transaction.user?._id, produce: produce?._id, cashReturnApprovedAt: transaction.date, cashReturnAmount: transaction.amount }).select(investmentFields).lean()
        : null;
    const track = produce?.tracks?.find(item => String(item._id) === String(transaction.trackId));
    return res.json({ success: true, data: { ...transaction, investment, ...(track ? { track } : {}) } });
  } catch (error) {
    logError("admin.transaction_details_failed", error);
    return res.status(500).json({ message: "Unable to load transaction details" });
  }
}
