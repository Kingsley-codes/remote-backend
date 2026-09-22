import type { ClientSession } from "mongoose";
import Investment from "../models/investmentModel.js";
import Referral from "../models/referralModel.js";
import Transaction from "../models/transactionModel.js";
import Wallet from "../models/walletModel.js";

export const REFERRAL_REWARD_PER_UNIT = 50;
export const REFERRAL_REWARD_MONTHS = 12;

export function getReferralExpiry(createdAt: Date) {
  const expiresAt = new Date(createdAt);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  return expiresAt;
}

export async function awardReferralCommission(
  userId: string,
  investmentId: string,
  session?: ClientSession,
) {
  const referral = await Referral.findOne({ referredUser: userId }).session(session ?? null);
  if (!referral) return;

  const expiresAt = referral.expiresAt ?? getReferralExpiry(referral.createdAt);
  const now = new Date();
  if (now >= expiresAt || referral.status === "expired") {
    await Referral.updateOne(
      { _id: referral._id },
      { $set: { status: "expired", expiresAt } },
      session ? { session } : {},
    );
    return;
  }

  const investment = await Investment.findOne({
    _id: investmentId,
    user: userId,
    orderStatus: "confirmed",
  })
    .select("units")
    .session(session ?? null);
  if (!investment) return;

  const alreadyRewarded = await Transaction.exists({
    transactionType: "referral-reward",
    referralRewardInvestment: investment._id,
  }).session(session ?? null);
  if (alreadyRewarded) return;

  const reward = investment.units * REFERRAL_REWARD_PER_UNIT;

  await Transaction.create(
    [{
      user: referral.referrer,
      referredUser: referral.referredUser,
      referralRewardInvestment: investment._id,
      transactionType: "referral-reward",
      transactionID: `REF-${investment._id.toString()}`,
      amount: reward,
      units: investment.units,
      paymentMethod: "wallet",
      status: "completed",
      date: now,
    }],
    session ? { session } : {},
  );

  await Referral.updateOne(
    { _id: referral._id, status: { $ne: "expired" } },
    {
      $set: {
        status: "active",
        expiresAt,
        qualifyingInvestment: investmentId,
        rewardedAt: now,
      },
      $inc: { commission: reward, rewardedUnits: investment.units },
    },
    session ? { session } : {},
  );

  await Wallet.findOneAndUpdate(
    { user: referral.referrer },
    {
      $inc: { balance: reward },
      $setOnInsert: {
        walletId: `WAL-${referral.referrer.toString().slice(-8).toUpperCase()}`,
        currency: "NGN",
      },
    },
    session ? { upsert: true, session } : { upsert: true },
  );
}
