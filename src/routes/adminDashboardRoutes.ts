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
  markPhysicalProduceDelivered,
  approveCashHarvestReturn,
  createFarmer,
  updateFarmer,
  deleteFarmer,
  updateFundingStatus,
  markYieldReceived,
  getDashboardOverview,
  getDashboardStats,
} from "../controllers/adminDashboardController.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";
import { cleanupUploadedFiles, handleUploadErrors, uploadProducerImages } from "../middleware/uploadMiddleware.js";

import { adminWithdrawBalance } from "../controllers/adminWalletController.js";

const adminDashboardRouter = express.Router();
adminDashboardRouter.post("/users/:userId/withdraw", adminAuthenticate, adminWithdrawBalance);
adminDashboardRouter.get("/overview", adminAuthenticate, getDashboardOverview);
adminDashboardRouter.get('/stats', adminAuthenticate, getDashboardStats);

adminDashboardRouter.get("/users", adminAuthenticate, getAllUsers);
adminDashboardRouter.post("/users/suspend", adminAuthenticate, suspendUser);
adminDashboardRouter.post("/users/activate", adminAuthenticate, activateUser);

adminDashboardRouter.get(
  "/investmets-stats",
  adminAuthenticate,
  getInvestmentStats,
);
adminDashboardRouter.get("/investments", adminAuthenticate, getInvestments);
adminDashboardRouter.patch(
  "/investments/:investmentId/mark-delivered",
  adminAuthenticate,
  markPhysicalProduceDelivered,
);
adminDashboardRouter.patch(
  "/investments/:investmentId/approve-cash-return",
  adminAuthenticate,
  approveCashHarvestReturn,
);
adminDashboardRouter.get("/payments", adminAuthenticate, getAllPayments);
adminDashboardRouter.get("/withdrawals", adminAuthenticate, getAllWithdrawals);

adminDashboardRouter.get("/farmers", adminAuthenticate, getAllFarmers);
adminDashboardRouter.post(
  "/farmers",
  adminAuthenticate,
  cleanupUploadedFiles,
  uploadProducerImages,
  handleUploadErrors,
  createFarmer,
);
adminDashboardRouter.patch(
  "/farmers/:farmerId",
  adminAuthenticate,
  cleanupUploadedFiles,
  uploadProducerImages,
  handleUploadErrors,
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
