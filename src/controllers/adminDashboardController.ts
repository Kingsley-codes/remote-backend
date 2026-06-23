import { Request, Response } from "express";
import User from "../models/userModel.js";
import Investment from "../models/investmentModel.js";
import { buildDateFilter } from "../utils/dateFilter.js";
import Payment from "../models/paymentModel.js";
import Withdrawal from "../models/withdrawalModel.js";
import Farmer from "../models/farmerModel.js";
import {
  deleteFromCloudinary,
  uploadToCloudinary,
} from "../middleware/uploadMiddleware.js";

type UserQuery = {
  status?: "active" | "suspended" | "pending";
  isVerified?: "true" | "false";
  page?: string;
  q?: string;
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
      filter.$or = [
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
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
          "wallet.user": 0,
          "wallet.__v": 0,
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: users,
      page: pageNumber,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
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
    return res.status(200).json({
      success: true,
      message: "User suspended successfully",
    });
  } catch (error: any) {
    console.error("Error suspending user:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
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
    return res.status(200).json({
      success: true,
      message: "User activated successfully",
    });
  } catch (error: any) {
    console.error("Error activating user:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
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
    console.error("Stats error:", error);

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

    const {
      status,
      date,
      startDate,
      endDate,
      search,
      page = "1",
    } = req.query as any;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limit = 10;
    const skip = (pageNumber - 1) * limit;

    const match: any = {
      ...buildDateFilter({ date, startDate, endDate }),
    };

    if (status) {
      match.orderStatus = status;
    }

    const investments = await Investment.aggregate([
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

      {
        $lookup: {
          from: "produces",
          localField: "produce",
          foreignField: "_id",
          as: "produce",
        },
      },
      { $unwind: { path: "$produce", preserveNullAndEmptyArrays: true } },

      ...(search
        ? [
            {
              $match: {
                $or: [
                  { "investor.firstName": { $regex: search, $options: "i" } },
                  { "investor.lastName": { $regex: search, $options: "i" } },
                  { title: { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await Investment.countDocuments(match);

    return res.status(200).json({
      success: true,
      data: investments,
      pagination: {
        page: pageNumber,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    console.error("Investment fetch error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
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

    const { paymentStatus, q, date, startDate, endDate, paymentMethod, page } =
      req.query;

    // Helper to safely extract a plain string from query params
    const asString = (val: typeof q): string | undefined =>
      typeof val === "string" ? val : undefined;

    const pageNumber = Math.max(parseInt(asString(page) ?? "1", 10) || 1, 1);
    const limit = 10;
    const skip = (pageNumber - 1) * limit;

    const filter: any = {
      ...buildDateFilter({
        date: asString(date),
        startDate: asString(startDate),
        endDate: asString(endDate),
      }),
    };

    if (
      paymentStatus &&
      ["Pending", "Refunded", "Completed", "Cancelled", "Failed"].includes(
        asString(paymentStatus) ?? "",
      )
    ) {
      filter.paymentStatus = asString(paymentStatus);
    }

    if (
      paymentMethod &&
      ["card", "bank", "wallet"].includes(asString(paymentMethod) ?? "")
    ) {
      filter.paymentMethod = asString(paymentMethod);
    }

    if (q) {
      const searchTerm = asString(q);
      if (searchTerm) {
        filter.$or = [
          { firstName: { $regex: searchTerm, $options: "i" } },
          { lastName: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
        ];
      }
    }

    const [allPayments, total] = await Promise.all([
      Payment.find(filter)
        .populate("user", "firstName lastName profilePhoto email")
        .populate("produce", "title")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Payment.countDocuments(filter),
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
    console.error("Payment fetch error:", error);

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

    const filter: any = {
      ...buildDateFilter({
        date: asString(date),
        startDate: asString(startDate),
        endDate: asString(endDate),
      }),
    };

    if (
      status &&
      ["pending", "success", "failed"].includes(asString(status) ?? "")
    ) {
      filter.paymentStatus = asString(status);
    }

    if (q) {
      const searchTerm = asString(q);
      if (searchTerm) {
        filter.$or = [
          { firstName: { $regex: searchTerm, $options: "i" } },
          { lastName: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
        ];
      }
    }

    const [allWithdrawals, total] = await Promise.all([
      Withdrawal.find(filter)
        .populate("user", "firstName lastName profilePhoto email")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Withdrawal.countDocuments(filter),
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
    console.error("Payment fetch error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Helper function to generate unique donor IDs
export const generateFarmerID = () =>
  "GRF-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const getAllFarmers = async (req: Request, res: Response) => {
  try {
    const farmers = await Farmer.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: farmers.length,
      farmers,
    });
  } catch (error: any) {
    console.error("Error fetching farmers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
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
        message: "Farmer not found",
      });
    }

    return res.status(200).json({
      farmer,
    });
  } catch (error: any) {
    console.error("Error fetching farmer:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
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
      cropsGrown,
      expectedYield,
    } = req.body;

    if (
      !name ||
      !town ||
      !lga ||
      !state ||
      !farmSize ||
      !fundingAmount ||
      !cropsGrown ||
      !expectedYield
    ) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    // Type assertion here
    const file = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!file || !file.profilePhoto || file?.profilePhoto?.[0]) {
      return res.status(400).json({
        error: "Farmer's photo is required",
      });
    }

    const profilePhoto = file.profilePhoto[0]!;

    const profilePhotoResult = await uploadToCloudinary(
      profilePhoto.buffer,
      "AgroFund Hub/farmer_images",
    );

    const newFarmer = await Farmer.create({
      name,
      town,
      lga,
      state,
      farmSize,
      fundingAmount,
      cropsGrown,
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
    console.error("Error creating farmer:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const updateFarmer = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    const { farmSize, fundingAmount, cropsGrown, expectedYield } = req.body;

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      { farmerId: farmerId },
      {
        farmSize,
        fundingAmount,
        cropsGrown,
        expectedYield,
      },
      { new: true },
    );

    if (!updatedFarmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    // Type assertion here
    const file = (req.files as { profilePhoto?: Express.Multer.File[] })
      ?.profilePhoto?.[0];

    if (file) {
      if (updatedFarmer.profilePhoto?.publicId) {
        await deleteFromCloudinary(updatedFarmer.profilePhoto.publicId);
      }

      const profilePhotoResult = await uploadToCloudinary(
        file.buffer,
        "AgroFund Hub/farmer_images",
      );

      updatedFarmer.profilePhoto = {
        publicId: profilePhotoResult.public_id,
        url: profilePhotoResult.secure_url,
      };
    }

    return res.status(200).json({
      success: true,
      farmer: updatedFarmer,
    });
  } catch (error: any) {
    console.error("Error updating farmer:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const deleteFarmer = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    const deletedFarmer = await Farmer.findByIdAndDelete({
      farmerId: farmerId,
    });

    if (!deletedFarmer) {
      return res.status(404).json({
        message: "Farmer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Farmer deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting farmer:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const updateFundingStatus = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;
    const { fundingStatus } = req.body;

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      { farmerId: farmerId },
      { fundingStatus },
      { new: true },
    );

    if (!updatedFarmer) {
      return res.status(404).json({
        message: "Farmer not found",
      });
    }

    return res.status(200).json({
      success: true,
      farmer: updatedFarmer,
    });
  } catch (error: any) {
    console.error("Error updating funding status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const markYieldReceived = async (
  req: Request<{ farmerId: string }>,
  res: Response,
) => {
  try {
    const { farmerId } = req.params;

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      { farmerId: farmerId },
      { yieldRecieved: true },
      { new: true },
    );

    if (!updatedFarmer) {
      return res.status(404).json({
        message: "Farmer not found",
      });
    }

    return res.status(200).json({
      success: true,
      farmer: updatedFarmer,
    });
  } catch (error: any) {
    console.error("Error marking yield as received:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// investment table
/*
  investmentId, investorName, title, produce, units, current stage, totalPrice, status, orderDate
  you may need a modal to show more details about the investment when clicked
  */

// the produce page needs to be modified such that the table shows a modal to set stage
