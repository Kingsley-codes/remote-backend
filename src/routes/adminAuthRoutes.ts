import express from "express";
import {
  adminLogin,
  googleAuthCallback,
  handleGoogleLogin,
  adminLogout,
  // requestPasswordReset,
  // verifyResetCode,
  // resetPassword,
  // resendResetCode,
} from "../controllers/adminAuthController.js";

const adminAuthRouter = express.Router();

// Admin Login route
adminAuthRouter.post("/login", adminLogin);
adminAuthRouter.post("/logout", adminLogout);

// Password reset routes
// adminAuthRouter.post('/forgot-password', requestPasswordReset); // Stage 1

// adminAuthRouter.post('/verify-reset-code', verifyResetCode);   // Stage 2

// adminAuthRouter.post('/reset-password', resetPassword);        // Stage 3

// adminAuthRouter.post('/resend-reset-code', resendResetCode);   // Resend code

// // Google OAuth
adminAuthRouter.get("/google", handleGoogleLogin);

adminAuthRouter.get("/google/callback", googleAuthCallback);

export default adminAuthRouter;
