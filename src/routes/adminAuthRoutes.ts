import express from "express";
import {
  adminLogin,
  adminLogout,
} from "../controllers/adminAuthController.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";

const adminAuthRouter = express.Router();

// Admin Login route
adminAuthRouter.post("/login", adminLogin);
adminAuthRouter.post("/logout", adminAuthenticate, adminLogout);

export default adminAuthRouter;
