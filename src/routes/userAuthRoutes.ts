import express from "express";
import {
  registerUser,
  login,
  handleGoogleLogin,
  googleAuthCallback,
  logout,
  verifySignupOtp,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authControllers.js";

const userAuthRouter = express.Router();

userAuthRouter.post("/register", registerUser); // User Registration routes
userAuthRouter.post("/register/verify-otp", verifySignupOtp);
userAuthRouter.post("/forgot-password", requestPasswordReset);
userAuthRouter.post("/reset-password", resetPassword);

userAuthRouter.post("/login", login); // User Login route

userAuthRouter.post("/logout", logout); // User Logout route

// Google OAuth
userAuthRouter.get("/google", handleGoogleLogin);

userAuthRouter.get("/google/callback", googleAuthCallback);

export default userAuthRouter;
