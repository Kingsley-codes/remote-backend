import { Request, Response } from "express";
import Admin from "../models/adminModel.js";

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
    console.error("Error fetching admin profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
