import { Request, Response } from "express";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";

export const fetchUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    console.log("fetching profile");

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userWallet = await Wallet.findOne({ user: userId });

    return res.status(200).json({
      success: true,
      data: {
        user,
        wallet: userWallet?.balance,
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const updates = {
      firstName: String(req.body.firstName ?? "").trim(),
      lastName: String(req.body.lastName ?? "").trim(),
      phone: String(req.body.phone ?? "").trim(),
      address: String(req.body.address ?? "").trim(),
      gender: req.body.gender === "male" || req.body.gender === "female" ? req.body.gender : undefined,
    };
    if (!updates.firstName || !updates.lastName) return res.status(400).json({ success: false, message: "First and last name are required" });

    const user = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return res.status(500).json({ success: false, message: "Unable to update profile" });
  }
};
