import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";

interface UserJwtPayload extends JwtPayload {
  id: string;
}

interface AdminJwtPayload extends JwtPayload {
  id: string;
}

// Protection Middleware
export const userAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token = req.cookies.user_token;

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "Not authorized, no token",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as UserJwtPayload;

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) throw new Error("User not found");

    req.user = currentUser._id;
    return next();
  } catch (err: any) {
    console.error("Protect error:", err);
    const message =
      err.name === "JsonWebTokenError"
        ? "Invalid token"
        : err.name === "TokenExpiredError"
          ? "Session expired"
          : err.message;

    return res.status(401).json({
      status: "fail",
      message,
    });
  }
};

export const optionalUserAuthenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.user_token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as UserJwtPayload;
      const user = await User.exists({ _id: decoded.id, status: "active" });
      if (user) req.user = user._id;
    }
  } catch {
    // Public endpoints remain accessible when a cookie is missing or stale.
  }
  next();
};

export const adminAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token = req.cookies.admin_token;

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "Not authorized, no token",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as AdminJwtPayload;

    const currentUser = await Admin.findById(decoded.id);
    if (!currentUser) throw new Error("Admin not found");

    req.admin = currentUser._id;
    return next();
  } catch (err: any) {
    console.error("Protect error:", err);
    const message =
      err.name === "JsonWebTokenError"
        ? "Invalid token"
        : err.name === "TokenExpiredError"
          ? "Session expired"
          : err.message;

    return res.status(401).json({
      status: "fail",
      message,
    });
  }
};
