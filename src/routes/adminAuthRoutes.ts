import express from "express";
import {
  adminLogin,
  googleAuthCallback,
  handleGoogleLogin,
  adminLogout,
} from "../controllers/adminAuthController.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";

const adminAuthRouter = express.Router();

// Admin Login route
adminAuthRouter.post("/login", adminLogin);
adminAuthRouter.post("/logout", adminAuthenticate, adminLogout);

// Google OAuth
adminAuthRouter.get("/google", handleGoogleLogin);

adminAuthRouter.get("/google/callback", googleAuthCallback);

export default adminAuthRouter;
