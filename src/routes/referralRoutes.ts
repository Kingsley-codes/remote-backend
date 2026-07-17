import { Router } from "express";
import {
  userAuthenticate,
  adminAuthenticate,
} from "../middleware/authenticationMiddleware.js";
import {
  getUserReferrals,
  getAdminReferrals,
} from "../controllers/referralController.js";

export const referralRouter = Router();
referralRouter.get("/", userAuthenticate, getUserReferrals);

export const adminReferralRouter = Router();
adminReferralRouter.get("/", adminAuthenticate, getAdminReferrals);
