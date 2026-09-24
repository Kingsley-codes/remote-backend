import { Request, Response } from "express";
import User from "../models/userModel.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../middleware/uploadMiddleware.js";
import validator from "validator";
import Wallet from "../models/walletModel.js";
import { logError } from "../utils/logger.js";

export const fetchUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
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
    logError("user.profile_fetch_failed", error, { userId: req.user?.toString() });
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

    const removalFlag = req.body.removeProfilePhoto;
    if (removalFlag !== undefined && ![true, false, "true", "false"].includes(removalFlag)) {
      return res.status(400).json({ success: false, message: "Invalid photo removal option" });
    }
    const removePhoto = removalFlag === true || removalFlag === "true";
    const file = !Array.isArray(req.files) ? req.files?.profilePhoto?.[0] : undefined;
    if (removePhoto && file) {
      return res.status(400).json({ success: false, message: "Choose either a new photo or photo removal" });
    }

    const updates = {
      firstName: String(req.body.firstName ?? "").trim(),
      lastName: String(req.body.lastName ?? "").trim(),
      phone: String(req.body.phone ?? "").trim(),
      address: String(req.body.address ?? "").trim(),
      gender: req.body.gender === "male" || req.body.gender === "female" ? req.body.gender : undefined,
    };
    if (!updates.firstName || !updates.lastName) return res.status(400).json({ success: false, message: "First and last name are required" });

    if (updates.firstName.length > 80 || updates.lastName.length > 80 || updates.address.length > 500 || (updates.phone && !validator.isMobilePhone(updates.phone, "any"))) {
      return res.status(400).json({ success: false, message: "Use names up to 80 characters, an address up to 500 characters and a valid phone number." });
    }
    if (req.body.gender !== undefined && !["", "male", "female"].includes(req.body.gender)) {
      return res.status(400).json({ success: false, message: "Invalid gender" });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.set(updates);
    await user.validate();
    const oldPhoto = user.profilePhoto?.publicId;
    const photo = file ? await uploadToCloudinary(file, "AgroFund Hub/profile_images") : undefined;
    if (removePhoto) user.set("profilePhoto", undefined);
    if (photo) user.profilePhoto = { publicId: photo.public_id, url: photo.secure_url };
    try { await user.save(); }
    catch (error) {
      if (photo) await deleteFromCloudinary(photo.public_id).catch(() => {});
      throw error;
    }
    if ((photo || removePhoto) && oldPhoto) {
      await deleteFromCloudinary(oldPhoto).catch((error) => {
        logError("user.profile_photo_cleanup_failed", error, { userId: userId.toString() });
      });
    }
    return res.json({ success: true, data: { user } });
  } catch (error) {
    logError("user.profile_update_failed", error, { userId: req.user?.toString() });
    return res.status(500).json({ success: false, message: "Unable to update profile" });
  }
};
