import { Request, Response } from "express";
import User from "../models/userModel.js";
import Referral from "../models/referralModel.js";
import {
  getReferralExpiry,
  REFERRAL_REWARD_MONTHS,
  REFERRAL_REWARD_PER_UNIT,
} from "../services/referralService.js";

const normalizeReferral = (referral: any) => {
  const item = referral.toObject();
  const expiresAt = item.expiresAt ?? getReferralExpiry(item.createdAt);
  return {
    ...item,
    expiresAt,
    status: new Date() >= expiresAt ? "expired" : "active",
  };
};

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

  const normalizedReferrals = referrals.map(normalizeReferral);
  const earned = normalizedReferrals.reduce((sum, item) => sum + item.commission, 0);

  return res.json({
    success: true,
    data: {
      referralCode: user?.farmerID,
      rewardPerUnit: REFERRAL_REWARD_PER_UNIT,
      rewardDurationMonths: REFERRAL_REWARD_MONTHS,
      stats: {
        total: normalizedReferrals.length,
        active: normalizedReferrals.filter((r) => r.status === "active").length,
        rewarded: normalizedReferrals.filter((r) => r.commission > 0).length,
        earned,
      },
      referrals: normalizedReferrals,
    },
  });
};

export const getAdminReferrals = async (req: Request, res: Response) => {
  const referrals = await Referral.find()
    .sort({ createdAt: -1 })
    .populate("referrer referredUser", "firstName lastName email farmerID");
  const normalizedReferrals = referrals.map(normalizeReferral);

  res.json({
    success: true,
    data: {
      rewardPerUnit: REFERRAL_REWARD_PER_UNIT,
      rewardDurationMonths: REFERRAL_REWARD_MONTHS,
      stats: {
        total: normalizedReferrals.length,
        active: normalizedReferrals.filter((r) => r.status === "active").length,
        rewarded: normalizedReferrals.filter((r) => r.commission > 0).length,
        paid: normalizedReferrals.reduce((sum, item) => sum + item.commission, 0),
      },
      referrals: normalizedReferrals,
    },
  });
};
