import express from "express";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  addBankAccount,
  getBanks,
  getUserInvestments,
  getUserTransactionHistory,
  getUserTransactionById,
  getUserDashboardOverview,
  withdrawBalance,
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
userDashboardRouter.post("/add-account", userAuthenticate, addBankAccount);
userDashboardRouter.get("/get-banks", userAuthenticate, getBanks);
userDashboardRouter.post("/withdraw", userAuthenticate, withdrawBalance);

export default userDashboardRouter;
