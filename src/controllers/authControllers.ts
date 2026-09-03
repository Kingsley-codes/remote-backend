import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/userModel.js";
import jwt, { SignOptions } from "jsonwebtoken";
import validator from "validator";
import {
  LoginRequestBody,
  RegisterRequestBody,
} from "../interface/allInterfaces.js";
import passport from "passport";
import { UserJwtPayload } from "../config/passport.js"; // import the interface
import Referral from "../models/referralModel.js";
import { consumeEmailOtp, issueEmailOtp } from "../services/otpService.js";
import { sendOtpEmail } from "../services/emailService.js";

// Helper function to sign JWT tokens for User
const signToken = (id: string): string => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN;

  if (!secret) throw new Error("JWT_SECRET is not defined");
  if (!expiresIn) throw new Error("JWT_EXPIRES_IN is not defined");

  return jwt.sign({ id, type: "user" }, secret, {
    expiresIn: expiresIn as NonNullable<SignOptions["expiresIn"]>,
  });
};

// Helper function to generate unique donor IDs
export const generateUSerID = () =>
  "RAU-" + Math.random().toString(36).substring(2, 10).toUpperCase();

// User Registration
export const registerUser = async (
  req: Request<{}, {}, RegisterRequestBody>,
  res: Response,
) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      referralCode,
    } = req.body;

    // Validate user input
    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      return res.status(400).json({
        status: "fail",
        message: "All fields are required",
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "fail",
        message: "Passwords do not match",
      });
    }

    // Validate password strength
    if (
      !validator.isStrongPassword(password, {
        minLength: 8,
        minUppercase: 1,
        minSymbols: 1,
        minNumbers: 1,
      })
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "Password must be at least 8 characters and include an uppercase letter, number, and symbol",
      });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid email format",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "An account already exists with this email",
      });
    }

    if (referralCode && !(await User.exists({ farmerID: referralCode.trim().toUpperCase() }))) {
      return res.status(400).json({ status: "fail", message: "Invalid referral code" });
    }

    const code = await issueEmailOtp({
      email: normalizedEmail,
      purpose: "signup",
      payload: {
        firstName,
        lastName,
        password: await bcrypt.hash(password, 12),
        referralCode: referralCode?.trim().toUpperCase() || undefined,
      },
    });
    await sendOtpEmail(normalizedEmail, code, "signup");

    return res.status(202).json({
      status: "success",
      message: "A verification code has been sent to your email",
      requiresVerification: true,
    });
  } catch (err: any) {
    console.error("Error registering user:", err);
    return res.status(500).json({
      status: "error",
      message: "Registration failed",
    });
  }
};

export const verifySignupOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };
    if (!email || !otp) return res.status(400).json({ status: "fail", message: "Email and verification code are required" });
    const payload = await consumeEmailOtp({ email, purpose: "signup", code: otp });
    if (!payload) return res.status(400).json({ status: "fail", message: "Invalid or expired verification code" });
    const { firstName, lastName, password, referralCode } = payload as { firstName: string; lastName: string; password: string; referralCode?: string };
    if (await User.exists({ email: email.trim().toLowerCase() })) return res.status(409).json({ status: "fail", message: "An account already exists with this email" });
    const referrer = referralCode ? await User.findOne({ farmerID: referralCode }) : null;
    const newUser = await User.create({ email: email.trim().toLowerCase(), password, firstName, lastName, farmerID: generateUSerID(), referredBy: referrer?._id, isVerified: true });
    if (referrer) await Referral.create({ referrer: referrer._id, referredUser: newUser._id, referralCode: referrer.farmerID });
    return res.status(201).json({ status: "success", message: "Email verified and account created" });
  } catch (err: any) {
    console.error("Signup verification error:", err);
    return res.status(500).json({ status: "error", message: "Unable to verify email" });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    if (!validator.isEmail(email)) return res.status(400).json({ status: "fail", message: "A valid email is required" });
    const user = await User.findOne({ email });
    if (user) {
      const code = await issueEmailOtp({ email, userId: user._id.toString(), purpose: "password-reset" });
      await sendOtpEmail(email, code, "password-reset");
    }
    return res.status(200).json({ status: "success", message: "If an account exists, a reset code has been sent" });
  } catch (err) {
    console.error("Password reset request error:", err);
    return res.status(503).json({ status: "error", message: "Unable to send reset code" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, password, confirmPassword } = req.body as { email?: string; otp?: string; password?: string; confirmPassword?: string };
    if (!email || !otp || !password || !confirmPassword) return res.status(400).json({ status: "fail", message: "Email, code, and password fields are required" });
    if (password !== confirmPassword || !validator.isStrongPassword(password, { minLength: 8, minUppercase: 1, minSymbols: 1, minNumbers: 1 })) return res.status(400).json({ status: "fail", message: "Use a strong matching password" });
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) return res.status(400).json({ status: "fail", message: "Invalid or expired reset code" });
    const valid = await consumeEmailOtp({ email, userId: user._id.toString(), purpose: "password-reset", code: otp });
    if (!valid) return res.status(400).json({ status: "fail", message: "Invalid or expired reset code" });
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    return res.status(200).json({ status: "success", message: "Password reset successfully" });
  } catch (err) {
    console.error("Password reset error:", err);
    return res.status(500).json({ status: "error", message: "Unable to reset password" });
  }
};

// User Login
export const login = async (
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

    const user = await User.findOne({ email }).select("+password");

    // Check if user exists and has a password
    if (!user || !user.password) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

    // Verify both password and user.password are defined before comparing
    if (!password || !user.password) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid credentials",
      });
    }

    // if (!user.isVerified) {
    //   return res.status(401).json({
    //     status: "fail",
    //     message: "Account not verified"
    //   });
    // }

    const token = signToken(user._id.toString());
    user.password = null;

    const isSecure = process.env.NODE_ENV === "production";

    res.cookie("user_token", token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (err: any) {
    console.error("Login error:", err);

    return res.status(500).json({
      status: "error",
      message: "Login failed due to server error",
    });
  }
};

export const logout = (req: Request, res: Response) => {
  const isSecure = process.env.NODE_ENV === "production";
  res.clearCookie("user_token", {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" : "lax",
  });

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};

export const handleGoogleLogin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  passport.authenticate("google-user", {
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
    "google-user",
    { session: false },
    (err: Error | null, user: UserJwtPayload | false) => {
      if (err) return next(err);
      if (!user)
        return res.redirect(
          `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
        );

      const token = signToken(user.id);
      const isSecure = process.env.NODE_ENV === "production";

      res.cookie("user_token", token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    },
  )(req, res, next);
};
