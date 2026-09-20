import express from "express";
import {
  adminLogin,
  googleAuthCallback,
  handleGoogleLogin,
  adminLogout,
} from "../controllers/adminAuthController.js";

const adminAuthRouter = express.Router();

// Admin Login route
adminAuthRouter.post("/login", adminLogin);
adminAuthRouter.post("/logout", adminLogout);

// Google OAuth
adminAuthRouter.get("/google", handleGoogleLogin);

adminAuthRouter.get("/google/callback", googleAuthCallback);

export default adminAuthRouter;
