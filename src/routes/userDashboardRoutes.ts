import express from "express";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  addBankAccount,
  getBanks,
  getUserInvestments,
  withdrawBalance,
} from "../controllers/userDashboardController.js";

const userDashboardRouter = express.Router();

userDashboardRouter.get("/investments", userAuthenticate, getUserInvestments);
userDashboardRouter.post("/add-account", userAuthenticate, addBankAccount);
userDashboardRouter.get("/get-banks", userAuthenticate, getBanks);
userDashboardRouter.post("/withdraw", userAuthenticate, withdrawBalance);

export default userDashboardRouter;
