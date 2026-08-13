import { Request, Response } from "express";
import User from "../models/userModel.js";
import Referral from "../models/referralModel.js";
import { REFERRAL_COMMISSION } from "../services/referralService.js";

export const getUserReferrals = async (req: Request, res: Response) => {
  const userId = req.user;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized Access",
    });
  }

  const user = await User.findById(userId).select("farmerID");

  const referrals = await Referral.find({ referrer: userId })
    .populate("referredUser", "firstName lastName email farmerID")
    .sort({ createdAt: -1 });

  const earned = referrals.reduce((sum, item) => sum + item.commission, 0);

  return res.json({
    success: true,
    data: {
      referralCode: user?.farmerID,
      commissionAmount: REFERRAL_COMMISSION,
      stats: {
        total: referrals.length,
        rewarded: referrals.filter((r) => r.status === "rewarded").length,
        earned,
      },
      referrals,
    },
  });
};

export const getAdminReferrals = async (req: Request, res: Response) => {
  const referrals = await Referral.find()
    .sort({ createdAt: -1 })
    .populate("referrer referredUser", "firstName lastName email farmerID");
  res.json({
    success: true,
    data: {
      stats: {
        total: referrals.length,
        rewarded: referrals.filter((r) => r.status === "rewarded").length,
        paid: referrals.reduce((s, r) => s + r.commission, 0),
      },
      referrals,
    },
  });
};
