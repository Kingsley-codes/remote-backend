import express from "express";
import {
  getAllUsers,
  suspendUser,
  activateUser,
  getInvestmentStats,
  getInvestments,
  getAllWithdrawals,
  getAllPayments,
  getAllFarmers,
  createFarmer,
  updateFarmer,
  deleteFarmer,
  updateFundingStatus,
  markYieldReceived,
} from "../controllers/adminDashboardController.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";
import { uploadProducerImages } from "../middleware/uploadMiddleware.js";

const adminDashboardRouter = express.Router();

adminDashboardRouter.get("/users", adminAuthenticate, getAllUsers);
adminDashboardRouter.post("/users/suspend", adminAuthenticate, suspendUser);
adminDashboardRouter.post("/users/activate", adminAuthenticate, activateUser);

adminDashboardRouter.get(
  "/investmets-stats",
  adminAuthenticate,
  getInvestmentStats,
);
adminDashboardRouter.get("/investments", adminAuthenticate, getInvestments);
adminDashboardRouter.get("/payments", adminAuthenticate, getAllPayments);
adminDashboardRouter.get("/withdrawals", adminAuthenticate, getAllWithdrawals);

adminDashboardRouter.get("/farmers", adminAuthenticate, getAllFarmers);
adminDashboardRouter.post(
  "/farmers",
  adminAuthenticate,
  uploadProducerImages,
  createFarmer,
);
adminDashboardRouter.patch(
  "/farmers/:farmerId",
  adminAuthenticate,
  uploadProducerImages,
  updateFarmer,
);
adminDashboardRouter.patch(
  "/farmers/:farmerId/funding",
  adminAuthenticate,
  updateFundingStatus,
);
adminDashboardRouter.patch(
  "/farmers/:farmerId/yield",
  adminAuthenticate,
  markYieldReceived,
);
adminDashboardRouter.delete(
  "/farmers/:farmerId",
  adminAuthenticate,
  deleteFarmer,
);

export default adminDashboardRouter;
