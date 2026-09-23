import { Request, Response } from "express";
import Transaction from "../models/transactionModel.js";
import User from "../models/userModel.js";
import Referral from "../models/referralModel.js";
import {
  getReferralExpiry,
  REFERRAL_REWARD_MONTHS,
} from "../services/referralService.js";

const normalizeReferral = (referral: any) => {
  const item = referral.toObject();
  const expiresAt = item.referredUser?.createdAt ? getReferralExpiry(item.referredUser.createdAt) : item.expiresAt ?? getReferralExpiry(item.createdAt);
  return {
    ...item,
    createdAt: item.referredUser?.createdAt ?? item.createdAt,
    expiresAt,
    status: new Date() >= expiresAt ? "expired" : "active",
  };
};

async function withRewards(referrals: any[]) {
  const rewards = await Transaction.find({ transactionType: "referral-reward", status: "completed", referredUser: { $in: referrals.map(r => r.referredUser?._id).filter(Boolean) } })
    .populate("referralRewardInvestment", "title orderID units track totalPrice orderDate")
    .sort({ date: -1 }).lean();
  return referrals.map(referral => ({ ...normalizeReferral(referral), rewards: rewards
    .filter(reward => String(reward.referredUser) === String(referral.referredUser?._id) && String(reward.user) === String(referral.referrer?._id ?? referral.referrer))
    .map(reward => ({ ...reward, referralBonus: reward.referralBonus ?? (reward.units ? reward.amount / reward.units : 0) })) }));
}

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
    .populate("referredUser", "firstName lastName email farmerID createdAt")
    .sort({ createdAt: -1 });

  const normalizedReferrals = await withRewards(referrals);
  const earned = normalizedReferrals.reduce((sum, item) => sum + item.commission, 0);

  return res.json({
    success: true,
    data: {
      referralCode: user?.farmerID,
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
    .populate("referrer referredUser", "firstName lastName email farmerID createdAt");
  const normalizedReferrals = await withRewards(referrals);

  res.json({
    success: true,
    data: {
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
