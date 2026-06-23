import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import Admin from "../models/adminModel.js";
import { LoginRequestBody } from "../interface/allInterfaces.js";
import { AdminJwtPayload } from "../config/passport.js";
import passport from "passport";

// Helper function to sign JWT tokens for Admin

const signToken = (id: string): string => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN;

  if (!secret) throw new Error("JWT_SECRET is not defined");
  if (!expiresIn) throw new Error("JWT_EXPIRES_IN is not defined");

  return jwt.sign({ id }, secret, {
    expiresIn: expiresIn as NonNullable<SignOptions["expiresIn"]>,
  });
};

// Admin Login
export const adminLogin = async (
  req: Request<{}, {}, LoginRequestBody>,
  res: Response,
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Email and password required",
      });
    }

    const admin = await Admin.findOne({ email }).select("+password");

    // Check if admin exists and has a password
    if (!admin || !admin.password) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

    // Verify both password and admin.password are defined before comparing
    if (!password || !admin.password) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

    const token = signToken(admin._id.toString());
    admin.password = null;

    const isProduction = process.env.COOKIE_SECURE === "true";

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      status: "success",
      data: { admin },
    });
  } catch (err: any) {
    console.error("Login error:", err);

    return res.status(500).json({
      status: "error",
      message: "Login failed due to server error",
      details: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

export const handleGoogleLogin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  passport.authenticate("google-admin", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
};

export const googleAuthCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  passport.authenticate(
    "google-admin",
    { session: false },
    (err: Error | null, user: AdminJwtPayload | false) => {
      if (err) return next(err);
      if (!user)
        return res.redirect(
          `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
        );

      const token = signToken(user.id);

      const isProduction = process.env.COOKIE_SECURE === "true";

      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    },
  )(req, res, next);
};

export const adminLogout = (req: Request, res: Response) => {
  const isProduction = process.env.COOKIE_SECURE === "true";

  res.cookie("admin_token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};
