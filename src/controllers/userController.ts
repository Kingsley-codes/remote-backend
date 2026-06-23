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
