import { parseCultivatedProduce, cultivationAnalytics } from "../utils/producerCultivation.js";
import {
  fulfillmentStages,
  normalizeStage,
} from "../utils/productionStages.js";
import { Request, Response } from "express";
import User from "../models/userModel.js";
import Investment from "../models/investmentModel.js";
import { buildDateFilter } from "../utils/dateFilter.js";
import { withdrawalPeriod } from "../utils/withdrawalPeriod.js";
import Farmer from "../models/farmerModel.js";
import Produce from "../models/produceModel.js";
import {
  deleteFromCloudinary,
  uploadToCloudinary,
} from "../middleware/uploadMiddleware.js";
import Transaction from "../models/transactionModel.js";
import Wallet from "../models/walletModel.js";
import Notification from "../models/notificationModel.js";
import mongoose from "mongoose";
import { generateReference } from "../helpers/paymentHelper.js";
import { sendAccountStatusEmail } from "../services/emailService.js";
import { sendUserEvent } from "../services/sseService.js";
import { logError } from "../utils/logger.js";
import { normalizeProducerFundingStatus, positiveNumber, producerFundingUpdate } from "../utils/producerFunding.js";

const safeSearchPattern = (value: unknown) =>
  typeof value === "string"
    ? value
        .trim()
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : "";

type UserQuery = {
  status?: "active" | "suspended" | "pending";
  isVerified?: "true" | "false";
  page?: string;
  q?: string;
};

const generateHarvestTransactionID = () =>
  "HAR-" + Math.random().toString(36).substring(2, 10).toUpperCase();

const calculateCashReturn = (totalPrice: number, profit: string | number) =>
  Math.round(totalPrice * (1 + Number(profit || 0) / 100));

export const getDashboardOverview = async (req: Request, res: Response) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const [
      investmentAgg,
      totalUsers,
      activeOpportunities,
      pendingWithdrawals,
      inflow,
      portfolio,
      recent,
      producers,
    ] = await Promise.all([
      Investment.aggregate([
        { $match: { orderStatus: "confirmed" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalPrice" },
            count: { $sum: 1 },
          },
        },
      ]),
      User.countDocuments(),
      Produce.countDocuments({ status: "active" }),
      Transaction.aggregate([
        {
          $match: {
            transactionType: "withdrawal",
            status: "pending",
          },
        },
        {
          $group: {
            _id: null,
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Investment.aggregate([
        {
          $match: {
            orderStatus: "confirmed",
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            amount: { $sum: "$totalPrice" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Investment.aggregate([
        { $match: { orderStatus: "confirmed" } },
        { $group: { _id: "$title", amount: { $sum: "$totalPrice" } } },
        { $sort: { amount: -1 } },
        { $limit: 5 },
      ]),
      Investment.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("user", "firstName lastName email")
        .lean(),
      Farmer.find().select("farmSize produceCultivated cropsGrown").lean(),
    ]);
    res.json({
      success: true,
      data: {
        stats: {
          totalInvestments: investmentAgg[0]?.total ?? 0,
          investmentCount: investmentAgg[0]?.count ?? 0,
          totalUsers,
          activeOpportunities,
          pendingWithdrawalAmount: pendingWithdrawals[0]?.amount ?? 0,
          pendingWithdrawalCount: pendingWithdrawals[0]?.count ?? 0,
        },
        cultivation: cultivationAnalytics(producers),
        inflow,
        portfolio,
        recent,
      },
    });
  } catch (error: any) {
    logError("admin.dashboard_overview_failed", error);
    res
      .status(500)
      .json({ success: false, message: "Unable to load dashboard overview" });
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalFarmers,
      activeFarmers,
      fundedFarmers,
      activeOpportunities,
      listingValue,
      popular,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: "active" }),
      Farmer.countDocuments(),
      Farmer.countDocuments({ status: "active" }),
      Farmer.countDocuments({ fundingStatus: "fully funded" }),
      Produce.countDocuments({ status: "active" }),
      Produce.aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $multiply: ["$price", "$totalUnit"] } },
          },
        },
      ]),
      Investment.aggregate([
        { $match: { orderStatus: "confirmed" } },
        { $group: { _id: "$title", units: { $sum: "$units" } } },
        { $sort: { units: -1 } },
        { $limit: 1 },
      ]),
    ]);
    return res.json({
      success: true,
      data: {
        users: { total: totalUsers, active: activeUsers },
        farmers: {
          total: totalFarmers,
          active: activeFarmers,
          funded: fundedFarmers,
        },
        opportunities: {
          active: activeOpportunities,
          listingValue: listingValue[0]?.total ?? 0,
          mostPopular: popular[0]?._id ?? "No investments yet",
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard statistics",
    });
  }
};

export const getAllUsers = async (
  req: Request<{}, {}, {}, UserQuery>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { status, q, isVerified, page = "1" } = req.query;

    const filter: any = {};

    // optional status filter
    if (status && ["active", "suspended"].includes(status)) {
      filter.status = status;
    }

    // optional isVerified filter
    if (isVerified && ["true", "false"].includes(isVerified)) {
      filter.isVerified = isVerified === "true";
    }

    if (q) {
      const safeQuery = safeSearchPattern(q);
      filter.$or = [
        { firstName: { $regex: safeQuery, $options: "i" } },
        { lastName: { $regex: safeQuery, $options: "i" } },
        { email: { $regex: safeQuery, $options: "i" } },
        { farmerID: { $regex: safeQuery, $options: "i" } },
      ];
    }

    const limit = 10;
    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const skip = (pageNumber - 1) * limit;

    const users = await User.aggregate([
      { $match: filter },

      {
        $lookup: {
          from: "wallets",
          localField: "_id",
          foreignField: "user",
          as: "wallet",
        },
      },

      {
        $unwind: {
          path: "$wallet",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          password: 0,
          sessionVersion: 0,
          googleId: 0,
          oauthProviders: 0,
          "wallet.user": 0,
          "wallet.__v": 0,
        },
      },

      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: users,
      page: pageNumber,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error: any) {
    logError("admin.users_list_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const suspendUser = async (
  req: Request<{ userId: string }>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status === "suspended") {
      return res.status(400).json({
        success: false,
        message: "User is already suspended",
      });
    }

    user.status = "suspended";
    await user.save();
    void sendAccountStatusEmail(user.email, user.firstName, "suspended");
    return res.status(200).json({
      success: true,
      message: "User suspended successfully",
    });
  } catch (error: any) {
    logError("admin.user_suspend_failed", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const activateUser = async (
  req: Request<{ userId: string }>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.status === "active") {
      return res.status(400).json({
        success: false,
        message: "User is already active",
      });
    }
    user.status = "active";
    await user.save();
    void sendAccountStatusEmail(user.email, user.firstName, "active");
    return res.status(200).json({
      success: true,
      message: "User activated successfully",
    });
  } catch (error: any) {
    logError("admin.user_activate_failed", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const getInvestmentStats = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const now = new Date();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      activeInvestments,
      totalAmount,
      thisMonth,
      lastMonth,
      popularProduce,
      currentMonthCount,
    ] = await Promise.all([
      Investment.countDocuments({ orderStatus: "confirmed" }),

      Investment.aggregate([
        { $match: { orderStatus: "confirmed" } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      Investment.aggregate([
        { $match: { createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      Investment.aggregate([
        {
          $match: {
            createdAt: {
              $gte: startOfLastMonth,
              $lte: endOfLastMonth,
            },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      Investment.aggregate([
        { $match: { orderStatus: "confirmed" } },
        {
          $group: {
            _id: "$title",
            investors: { $addToSet: "$user" },
            totalUnits: { $sum: "$units" },
          },
        },
        { $sort: { totalUnits: -1 } },
        { $limit: 1 },
      ]),

      // NEW: total investments made this month
      Investment.countDocuments({
        createdAt: { $gte: startOfMonth },
      }),
    ]);

    const thisMonthTotal = thisMonth[0]?.total || 0;
    const lastMonthTotal = lastMonth[0]?.total || 0;

    const percentageChange =
      lastMonthTotal === 0
        ? 100
        : ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;

    const popular = popularProduce[0];

    return res.status(200).json({
      success: true,
      stats: {
        totalActiveInvestments: activeInvestments,
        totalAmountInvested: totalAmount[0]?.total || 0,
        investmentChangePercentage: Number(percentageChange.toFixed(2)),
        mostPopularProduce: popular?._id || null,
        totalInvestorsForPopularProduce: popular?.investors?.length || 0,
        investmentsThisMonth: currentMonthCount,
      },
    });
  } catch (error: any) {
    logError("admin.investment_stats_failed", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getInvestments = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { status, date, startDate, endDate, project, category } = req.query;
    const search = String(req.query.search ?? req.query.q ?? "").trim();
    const pageNumber = Math.max(Math.floor(Number(req.query.page) || 1), 1);
    const limit = 10;
    const match: Record<string, unknown> = {
      ...buildDateFilter({
        date: String(date ?? ""),
        startDate: String(startDate ?? ""),
        endDate: String(endDate ?? ""),
      }),
    };
    if (status) {
      if (["ongoing", "completed"].includes(String(status))) {
        match.status = status;
        match.orderStatus = "confirmed";
      } else if (["pending", "confirmed", "cancelled"].includes(String(status)))
        match.orderStatus = status;
      else
        return res
          .status(400)
          .json({ success: false, message: "Invalid ownership status" });
    }
    if (project) {
      if (typeof project !== "string" || !/^[a-f0-9]{24}$/i.test(project))
        return res
          .status(400)
          .json({ success: false, message: "Invalid project" });
      match.produce = project;
    }
    if (
      category &&
      !["crops", "livestock", "aquaculture"].includes(String(category))
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category" });
    }
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const [results, projects] = await Promise.all([
      Investment.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "investor",
          },
        },
        { $unwind: { path: "$investor", preserveNullAndEmptyArrays: true } },
        // Investments store their project ID as a string, while produces use ObjectIds.
        {
          $addFields: {
            produceObjectId: {
              $convert: {
                input: "$produce",
                to: "objectId",
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: "produces",
            localField: "produceObjectId",
            foreignField: "_id",
            as: "produce",
          },
        },
        { $unwind: { path: "$produce", preserveNullAndEmptyArrays: true } },
        ...(category ? [{ $match: { "produce.category": category } }] : []),
        ...(search
          ? [
              {
                $match: {
                  $or: [
                    {
                      "investor.firstName": {
                        $regex: escapedSearch,
                        $options: "i",
                      },
                    },
                    {
                      "investor.lastName": {
                        $regex: escapedSearch,
                        $options: "i",
                      },
                    },
                    {
                      "investor.email": {
                        $regex: escapedSearch,
                        $options: "i",
                      },
                    },
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { orderID: { $regex: escapedSearch, $options: "i" } },
                  ],
                },
              },
            ]
          : []),
        {
          $project: {
            "investor.password": 0,
            "investor.oauthProviders": 0,
            "investor.googleId": 0,
            produceObjectId: 0,
          },
        },
        {
          $facet: {
            data: [
              { $sort: { createdAt: -1, _id: -1 } },
              { $skip: (pageNumber - 1) * limit },
              { $limit: limit },
            ],
            total: [{ $count: "count" }],
          },
        },
      ]),
      Produce.find()
        .select("title produceName category")
        .sort({ title: 1 })
        .lean(),
    ]);
    const result = results[0];
    const total = result?.total[0]?.count ?? 0;
    return res.status(200).json({
      success: true,
      data: (result?.data ?? []).map((investment: any) => ({
        ...investment,
        stage: normalizeStage(investment.stage, investment.produce?.category),
      })),
      projects,
      pagination: {
        page: pageNumber,
        pages: Math.max(1, Math.ceil(total / limit)),
        total,
      },
    });
  } catch (error) {
    logError("admin.investments_list_failed", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const markPhysicalProduceDelivered = async (
  req: Request,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const investment = await Investment.findOneAndUpdate(
      {
        _id: req.params.investmentId,
        stage: { $in: fulfillmentStages },
        harvestChoice: "physical-produce",
        harvestFulfillmentStatus: "pending-delivery",
      },
      {
        harvestFulfillmentStatus: "delivered",
        harvestDeliveredAt: new Date(),
        status: "completed",
      },
      { new: true },
    );

    if (!investment) {
      return res.status(409).json({
        success: false,
        message: "This farm is not waiting for physical produce delivery",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Physical produce marked as delivered",
      data: { investment },
    });
  } catch (error: any) {
    logError("admin.delivery_update_failed", error);
    return res.status(500).json({
      success: false,
      message: "Unable to mark delivery",
    });
  }
};

export const approveCashHarvestReturn = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const now = new Date();
    const transactionRef = generateReference("harvest");
    let updatedInvestment: any = null;
    let rolloverNotification: any = null;

    await session.withTransaction(async () => {
      const investment = await Investment.findOne({
        _id: req.params.investmentId,
        stage: { $in: fulfillmentStages },
        harvestChoice: "cash-return",
        harvestFulfillmentStatus: "pending-approval",
      }).session(session);

      if (!investment) {
        throw new Error("This farm is not waiting for cash return approval");
      }

      const cashReturnAmount = calculateCashReturn(
        investment.totalPrice,
        investment.profit,
      );

      updatedInvestment = await Investment.findOneAndUpdate(
        {
          _id: investment._id,
          harvestFulfillmentStatus: "pending-approval",
          cashReturnApprovedAt: { $exists: false },
        },
        {
          harvestFulfillmentStatus: "approved",
          cashReturnApprovedAt: now,
          cashReturnAmount,
          status: "completed",
        },
        { new: true, session },
      );

      if (!updatedInvestment) {
        throw new Error("Cash return has already been approved");
      }

      await Wallet.findOneAndUpdate(
        { user: investment.user },
        {
          $inc: { balance: cashReturnAmount },
          $setOnInsert: {
            user: investment.user,
            currency: "NGN",
            walletId: `WAL-${String(investment.user).slice(-8).toUpperCase()}`,
          },
        },
        { upsert: true, new: true, session },
      );

      await Transaction.create(
        [
          {
            user: investment.user,
            transactionType: "harvest-return",
            produce: investment.produce,
            transactionID: generateHarvestTransactionID(),
            transactionRef,
            amount: cashReturnAmount,
            currency: "NGN",
            status: "completed",
            date: now,
          },
        ],
        { session },
      );

      const notifications = await Notification.create(
        [
          {
            title: "Your farm returns are ready",
            message: `Your capital plus profit of NGN ${cashReturnAmount.toLocaleString("en-NG")} has been credited to your Agro Wallet. You can roll it over into ${investment.title} and choose any available track.`,
            type: "admin",
            produce: investment.produce,
            ...(investment.track?.id ? { trackId: investment.track.id } : {}),
            recipients: [investment.user],
            createdBy: admin,
          },
        ],
        { session },
      );
      rolloverNotification = notifications[0] ?? null;
    });

    if (rolloverNotification && updatedInvestment) {
      await rolloverNotification.populate("produce", "produceName title stage");
      sendUserEvent(
        String(updatedInvestment.user),
        "notification",
        rolloverNotification,
      );
    }

    return res.status(200).json({
      success: true,
      message: "Cash return approved and credited to wallet",
      data: { investment: updatedInvestment },
    });
  } catch (error: any) {
    logError("admin.cash_return_approval_failed", error);
    return res.status(400).json({
      success: false,
      message: "Unable to approve cash return",
    });
  } finally {
    session.endSession();
  }
};

export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { status, q, date, startDate, endDate, paymentMethod, page } =
      req.query;

    const asString = (val: unknown): string | undefined =>
      typeof val === "string" ? val : undefined;

    const pageNumber = Math.max(parseInt(asString(page) ?? "1", 10) || 1, 1);

    const limit = 10;
    const skip = (pageNumber - 1) * limit;

    // Always fetch investment payments only
    const filter: any = {
      transactionType: "investment-payment",
      ...buildDateFilter({
        date: asString(date),
        startDate: asString(startDate),
        endDate: asString(endDate),
      }),
    };

    // Filter by payment status
    const validStatuses = [
      "pending",
      "completed",
      "refunded",
      "cancelled",
      "failed",
    ];

    const statusValue = asString(status);

    if (statusValue && validStatuses.includes(statusValue)) {
      filter.status = statusValue;
    }

    // Filter by payment method
    const validPaymentMethods = ["card", "bank", "wallet"];

    const paymentMethodValue = asString(paymentMethod);

    if (
      paymentMethodValue &&
      validPaymentMethods.includes(paymentMethodValue)
    ) {
      filter.paymentMethod = paymentMethodValue;
    }

    // Search users
    const searchTerm = safeSearchPattern(asString(q));

    if (searchTerm) {
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: searchTerm, $options: "i" } },
          { lastName: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
        ],
      }).select("_id");

      filter.user = {
        $in: matchingUsers.map((user) => user._id),
      };
    }

    const [allPayments, total] = await Promise.all([
      Transaction.find(filter)
        .populate("user", "firstName lastName profilePhoto email farmerID")
        .populate("produce", "title")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),

      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: allPayments,
      pagination: {
        page: pageNumber,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error: any) {
    logError("admin.payments_list_failed", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getAllWithdrawals = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { status, q, date, startDate, endDate, page } = req.query;

    // Helper to safely extract a plain string from query params
    const asString = (val: typeof q): string | undefined =>
      typeof val === "string" ? val : undefined;

    const pageNumber = Math.max(parseInt(asString(page) ?? "1", 10) || 1, 1);
    const limit = 10;
    const skip = (pageNumber - 1) * limit;

    let periodFilter;
    try {
      periodFilter = withdrawalPeriod(asString(date), asString(startDate), asString(endDate));
    } catch (error) {
      return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Invalid period" });
    }
    const filter: any = { transactionType: "withdrawal", ...periodFilter };

    if (
      status &&
      ["pending", "completed", "cancelled", "failed"].includes(asString(status) ?? "")
    ) {
      filter.status = asString(status);
    }

    if (status === "history") filter.status = { $in: ["completed", "cancelled"] };

    if (q) {
      const searchTerm = safeSearchPattern(asString(q));
      if (searchTerm) {
        const users = await User.find({ $or: [
          { firstName: { $regex: searchTerm, $options: "i" } },
          { lastName: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
          { farmerID: { $regex: searchTerm, $options: "i" } },
        ] }).select("_id").lean();
        filter.$or = [
          { transactionID: { $regex: searchTerm, $options: "i" } },
          { user: { $in: users.map((user) => user._id) } },
        ];
      }
    }

    const [allWithdrawals, total] = await Promise.all([
      Transaction.find(filter)
        .populate("user", "firstName lastName profilePhoto email farmerID")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: allWithdrawals,
      pagination: {
        page: pageNumber,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error: any) {
    logError("admin.withdrawals_list_failed", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Helper function to generate unique donor IDs
export const generateFarmerID = () =>
  "RAF-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const getAllFarmers = async (req: Request, res: Response) => {
  try {
    const farmers = await Farmer.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: farmers.length,
      farmers,
    });
  } catch (error: any) {
    logError("admin.farmers_list_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const fetchSingleFarmer = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    const farmer = await Farmer.findById(farmerId);
    if (!farmer) {
      return res.status(404).json({
        message: "Producer not found",
      });
    }

    return res.status(200).json({
      farmer,
    });
  } catch (error: any) {
    logError("admin.farmer_fetch_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const createFarmer = async (req: Request, res: Response) => {
  try {
    const {
      name,
      town,
      lga,
      state,
      farmSize,
      fundingAmount,
      produceCultivated,
      expectedYield,
    } = req.body;

    if (
      !name ||
      !town ||
      !lga ||
      !state ||
      !farmSize ||
      !fundingAmount ||
      !produceCultivated
    ) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    if (positiveNumber(farmSize) === null || positiveNumber(fundingAmount) === null) {
      return res.status(400).json({ success: false, message: "Farm size in acres and funding amount must be positive numbers" });
    }

    if (expectedYield !== undefined && typeof expectedYield !== "string") {
      return res.status(400).json({ success: false, message: "Expected yield must be text" });
    }
    let cultivation;
    try { cultivation = parseCultivatedProduce(produceCultivated); }
    catch (error) { return res.status(400).json({ success: false, message: (error as Error).message }); }

    // Type assertion here
    const file = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!file || !file.profilePhoto) {
      return res.status(400).json({
        error: "Producer's photo is required",
      });
    }

    const profilePhoto = file.profilePhoto[0]!;

    const profilePhotoResult = await uploadToCloudinary(
      profilePhoto,
      "AgroFund Hub/farmer_images",
    );

    const newFarmer = await Farmer.create({
      name,
      town,
      lga,
      state,
      farmSize: String(Number(farmSize)),
      fundingAmount: String(Number(fundingAmount)),
      amountFunded: 0,
      produceCultivated: cultivation,
      farmerID: generateFarmerID(),
      expectedYield,
      profilePhoto: {
        publicId: profilePhotoResult.public_id,
        url: profilePhotoResult.secure_url,
      },
    });

    return res.status(201).json({
      success: true,
      farmer: newFarmer,
    });
  } catch (error: any) {
    logError("admin.farmer_create_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateFarmer = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    const { farmSize, fundingAmount, produceCultivated, expectedYield } = req.body;

    if (!mongoose.isObjectIdOrHexString(farmerId)) {
      return res.status(400).json({ success: false, message: "Invalid producer ID" });
    }
    if ((farmSize !== undefined && positiveNumber(farmSize) === null) ||
        (fundingAmount !== undefined && positiveNumber(fundingAmount) === null)) {
      return res.status(400).json({ success: false, message: "Farm size in acres and funding amount must be positive numbers" });
    }
    let cultivation;
    if (produceCultivated !== undefined) {
      try { cultivation = parseCultivatedProduce(produceCultivated); }
      catch (error) { return res.status(400).json({ success: false, message: (error as Error).message }); }
    }
    if (expectedYield !== undefined && typeof expectedYield !== "string") {
      return res.status(400).json({ success: false, message: "Expected yield must be text" });
    }
    const updatedFarmer = await Farmer.findById(farmerId);

    if (!updatedFarmer) {
      return res.status(404).json({
        success: false,
        message: "Producer not found",
      });
    }

    const status = normalizeProducerFundingStatus(updatedFarmer.fundingStatus);
    if (fundingAmount !== undefined && status === "partially funded" &&
        updatedFarmer.amountFunded != null && Number(fundingAmount) <= updatedFarmer.amountFunded) {
      return res.status(400).json({ success: false, message: "Total funding must exceed the amount already funded. Update funding status first." });
    }
    if (farmSize !== undefined) updatedFarmer.farmSize = String(Number(farmSize));
    if (fundingAmount !== undefined) {
      updatedFarmer.fundingAmount = String(Number(fundingAmount));
      if (status === "fully funded") updatedFarmer.amountFunded = Number(fundingAmount);
    }
    updatedFarmer.set("fundingStatus", status);
    if (cultivation !== undefined) {
      updatedFarmer.set("produceCultivated", cultivation);
      updatedFarmer.set("cropsGrown", undefined);
    }
    if (expectedYield !== undefined) updatedFarmer.expectedYield = expectedYield;

    // Type assertion here
    const file = (req.files as { profilePhoto?: Express.Multer.File[] })
      ?.profilePhoto?.[0];

    if (file) {
      if (updatedFarmer.profilePhoto?.publicId) {
        await deleteFromCloudinary(updatedFarmer.profilePhoto.publicId);
      }

      const profilePhotoResult = await uploadToCloudinary(
        file,
        "AgroFund Hub/farmer_images",
      );

      updatedFarmer.profilePhoto = {
        publicId: profilePhotoResult.public_id,
        url: profilePhotoResult.secure_url,
      };
    }

    await updatedFarmer.save();
    return res.status(200).json({ success: true, farmer: updatedFarmer });
  } catch (error: any) {
    logError("admin.farmer_update_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const deleteFarmer = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    if (!mongoose.isObjectIdOrHexString(farmerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid producer ID",
      });
    }

    const deletedFarmer = await Farmer.findByIdAndDelete(farmerId);

    if (!deletedFarmer) {
      return res.status(404).json({
        message: "Producer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Producer deleted successfully",
    });
  } catch (error: any) {
    logError("admin.farmer_delete_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateFundingStatus = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    const { fundingStatus, amountFunded } = req.body;
    if (!mongoose.isObjectIdOrHexString(farmerId)) {
      return res.status(400).json({ success: false, message: "Invalid producer ID" });
    }
    if (fundingStatus === undefined || fundingStatus === null) {
      return res.status(400).json({ success: false, message: "Funding status is required" });
    }
    const updatedFarmer = await Farmer.findById(farmerId);

    if (!updatedFarmer) {
      return res.status(404).json({
        message: "Producer not found",
      });
    }

    try {
      updatedFarmer.set(producerFundingUpdate(fundingStatus, amountFunded, updatedFarmer.fundingAmount));
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
    await updatedFarmer.save();
    return res.status(200).json({ success: true, farmer: updatedFarmer });
  } catch (error: any) {
    logError("admin.farmer_funding_update_failed", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
