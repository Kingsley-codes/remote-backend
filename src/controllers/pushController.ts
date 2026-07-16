import { Request, Response } from "express";
import PushSubscription from "../models/pushSubscriptionModel.js";

export const subscribeToPush = (ownerType: "user" | "admin") => async (req: Request, res: Response) => {
  const owner = ownerType === "admin" ? req.admin : req.user;
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth)
    return res.status(400).json({ status: "fail", message: "Invalid push subscription" });
  await PushSubscription.findOneAndUpdate(
    { endpoint }, { ownerType, owner, endpoint, keys }, { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return res.status(201).json({ status: "success" });
};

export const unsubscribeFromPush = async (req: Request, res: Response) => {
  await PushSubscription.deleteOne({ endpoint: req.body.endpoint });
  return res.json({ status: "success" });
};
