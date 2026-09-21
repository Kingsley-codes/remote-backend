import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import Admin from "../models/adminModel.js";
import { LoginRequestBody } from "../interface/allInterfaces.js";
import { AdminJwtPayload } from "../config/passport.js";
import passport from "passport";
import { authCookieOptions, signIdentityToken } from "../services/tokenService.js";
import { consumeOAuthState, issueOAuthState } from "../services/oauthStateService.js";
import { writeActorAuditSafely } from "../services/auditService.js";
import { logError } from "../utils/logger.js";

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

    const admin = await Admin.findOne({ email: email.trim().toLowerCase(), status: "active" }).select("+password");

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

    const token = signIdentityToken(admin._id.toString(), "admin", admin.sessionVersion ?? 0);
    admin.password = null;

    res.cookie("admin_token", token, authCookieOptions());
    req.admin = admin._id;
    await writeActorAuditSafely(req, { action: "LOGIN", entityType: "ADMIN", entityId: admin.id, details: "Password login" });

    return res.status(200).json({
      status: "success",
      data: { admin },
    });
  } catch (err: any) {
    logError("auth.admin_login_failed", err);

    return res.status(500).json({
      status: "error",
      message: "Login failed due to server error",
    });
  }
};

export const handleGoogleLogin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const state = issueOAuthState(res, "oauth_admin_state");
  passport.authenticate("google-admin", {
    scope: ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
};

export const googleAuthCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!consumeOAuthState(req, res, "oauth_admin_state")) {
    return res.redirect(`${process.env.FRONTEND_URL}/admin/login?error=invalid_oauth_state`);
  }
  passport.authenticate(
    "google-admin",
    { session: false },
    (err: Error | null, user: AdminJwtPayload | false) => {
      if (err) return next(err);
      if (!user)
        return res.redirect(
          `${process.env.FRONTEND_URL}/admin/login?error=oauth_failed`,
        );

      void Admin.findById(user.id).select("sessionVersion").then(async (record) => {
        if (!record) return res.redirect(`${process.env.FRONTEND_URL}/admin/login?error=oauth_failed`);
        const token = signIdentityToken(user.id, "admin", record.sessionVersion ?? 0);
        res.cookie("admin_token", token, authCookieOptions());
        req.admin = record._id;
        await writeActorAuditSafely(req, { action: "LOGIN", entityType: "ADMIN", entityId: user.id, details: "Google OAuth login" });
        res.redirect(`${process.env.FRONTEND_URL}/admin/dashboard`);
      }).catch((error) => {
        logError("auth.oauth_admin_callback_failed", error);
        next(error);
      });
    },
  )(req, res, next);
};

export const adminLogout = async (req: Request, res: Response) => {
  if (req.admin) {
    await Admin.updateOne({ _id: req.admin }, { $inc: { sessionVersion: 1 } });
    await writeActorAuditSafely(req, { action: "LOGOUT", entityType: "ADMIN", entityId: req.admin.toString(), details: "All admin sessions revoked" });
  }
  res.clearCookie("admin_token", authCookieOptions());

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};
