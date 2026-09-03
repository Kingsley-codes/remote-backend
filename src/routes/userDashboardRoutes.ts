import express from "express";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  addBankAccount,
  getBankAccount,
  getBanks,
  getUserInvestments,
  getUserTransactionHistory,
  getUserTransactionById,
  getUserDashboardOverview,
  removeBankAccount,
  updateBankAccount,
  withdrawBalance,
  chooseHarvestReturn,
  requestBankAccountOtp,
} from "../controllers/userDashboardController.js";

const userDashboardRouter = express.Router();

userDashboardRouter.get(
  "/overview",
  userAuthenticate,
  getUserDashboardOverview,
);
userDashboardRouter.get("/investments", userAuthenticate, getUserInvestments);
userDashboardRouter.get(
  "/transactions",
  userAuthenticate,
  getUserTransactionHistory,
);
userDashboardRouter.get(
  "/transactions/:id",
  userAuthenticate,
  getUserTransactionById,
);
userDashboardRouter.post("/add-account/request-otp", userAuthenticate, requestBankAccountOtp);
userDashboardRouter.post("/add-account", userAuthenticate, addBankAccount);
userDashboardRouter.get("/bank-account", userAuthenticate, getBankAccount);
userDashboardRouter.put("/bank-account", userAuthenticate, updateBankAccount);
userDashboardRouter.delete("/bank-account", userAuthenticate, removeBankAccount);
userDashboardRouter.get("/get-banks", userAuthenticate, getBanks);
userDashboardRouter.post("/withdraw", userAuthenticate, withdrawBalance);
userDashboardRouter.patch(
  "/investments/:investmentId/harvest-choice",
  userAuthenticate,
  chooseHarvestReturn,
);

export default userDashboardRouter;
