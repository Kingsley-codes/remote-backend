import { Request, Response } from "express";
import Admin from "../models/adminModel.js";
import { logError } from "../utils/logger.js";

export const fetchAdminProfile = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const admin = await Admin.findById(adminId).select("-password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    logError("admin.profile_fetch_failed", error, { adminId: req.admin?.toString() });
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
