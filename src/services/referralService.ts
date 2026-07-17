import type { ClientSession } from "mongoose";
import Referral from "../models/referralModel.js";
import Wallet from "../models/walletModel.js";

export const REFERRAL_COMMISSION = 10000;

export async function awardReferralCommission(userId: string, investmentId: string, session?: ClientSession) {
  const referral = await Referral.findOne({ referredUser: userId, status: "registered" }).session(session ?? null);
  if (!referral) return;
  const claimed = await Referral.updateOne(
    { _id: referral._id, status: "registered" },
    { $set: { status: "rewarded", commission: REFERRAL_COMMISSION, qualifyingInvestment: investmentId, rewardedAt: new Date() } },
    session ? { session } : {},
  );
  if (!claimed.modifiedCount) return;
  await Wallet.findOneAndUpdate(
    { user: referral.referrer },
    { $inc: { balance: REFERRAL_COMMISSION }, $setOnInsert: { walletId: `WAL-${referral.referrer.toString().slice(-8).toUpperCase()}`, currency: "NGN" } },
    session ? { upsert: true, session } : { upsert: true },
  );
}
