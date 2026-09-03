import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";

interface UserJwtPayload extends JwtPayload {
  id: string;
  type: "user";
}

interface AdminJwtPayload extends JwtPayload {
  id: string;
  type: "admin";
}

export const requireTrustedOrigin = (req: Request, res: Response): boolean => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.get("origin");
  const allowedOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_LOCALHOST]
    .filter((value): value is string => Boolean(value));
  if (origin && allowedOrigins.includes(origin)) return true;
  res.status(403).json({ status: "fail", message: "Invalid request origin" });
  return false;
};

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

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Authentication is not configured");
    const decoded = jwt.verify(token, secret) as UserJwtPayload;
    if (decoded.type !== "user") throw new Error("Invalid token");

    const currentUser = await User.findOne({ _id: decoded.id, status: "active" });
    if (!currentUser) throw new Error("User not found");
    if (!requireTrustedOrigin(req, res)) return;

    req.user = currentUser._id;
    return next();
  } catch (err: any) {
    console.error("Protect error:", err);
    const message =
      err.name === "JsonWebTokenError" || err.message === "Invalid token"
        ? "Invalid token"
        : err.name === "TokenExpiredError"
          ? "Session expired"
          : "Not authorized";

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
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("Authentication is not configured");
      const decoded = jwt.verify(token, secret) as UserJwtPayload;
      if (decoded.type !== "user") throw new Error("Invalid token");
      const user = await User.exists({ _id: decoded.id, status: "active" });
      if (user) {
        if (!requireTrustedOrigin(req, _res)) return;
        req.user = user._id;
      }
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

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Authentication is not configured");
    const decoded = jwt.verify(token, secret) as AdminJwtPayload;
    if (decoded.type !== "admin") throw new Error("Invalid token");

    const currentUser = await Admin.findOne({ _id: decoded.id, status: "active" });
    if (!currentUser) throw new Error("Admin not found");
    if (!requireTrustedOrigin(req, res)) return;

    req.admin = currentUser._id;
    return next();
  } catch (err: any) {
    console.error("Protect error:", err);
    const message =
      err.name === "JsonWebTokenError" || err.message === "Invalid token"
        ? "Invalid token"
        : err.name === "TokenExpiredError"
          ? "Session expired"
          : "Not authorized";

    return res.status(401).json({
      status: "fail",
      message,
    });
  }
};
