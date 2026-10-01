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
  getDashboardOverview,
  getDashboardStats,
} from "../controllers/adminDashboardController.js";
import { adminAuthenticate, requireSuperAdmin } from "../middleware/authenticationMiddleware.js";
import { cleanupUploadedFiles, handleUploadErrors, uploadProducerImages, uploadWithdrawalReceipt } from "../middleware/uploadMiddleware.js";

import { adminWithdrawBalance } from "../controllers/adminWalletController.js";
import { approveWithdrawal, getWithdrawalDetails } from "../controllers/manualWithdrawalController.js";

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
adminDashboardRouter.get("/withdrawals/:withdrawalId", adminAuthenticate, getWithdrawalDetails);
adminDashboardRouter.post("/withdrawals/:withdrawalId/approve", adminAuthenticate, cleanupUploadedFiles, uploadWithdrawalReceipt, handleUploadErrors, approveWithdrawal);

adminDashboardRouter.use("/farmers", adminAuthenticate, requireSuperAdmin);
adminDashboardRouter.get("/farmers", getAllFarmers);
adminDashboardRouter.post(
  "/farmers",
  cleanupUploadedFiles,
  uploadProducerImages,
  handleUploadErrors,
  createFarmer,
);
adminDashboardRouter.patch(
  "/farmers/:farmerId",
  cleanupUploadedFiles,
  uploadProducerImages,
  handleUploadErrors,
  updateFarmer,
);
adminDashboardRouter.patch(
  "/farmers/:farmerId/funding",
  updateFundingStatus,
);
adminDashboardRouter.delete(
  "/farmers/:farmerId",
  deleteFarmer,
);

export default adminDashboardRouter;
