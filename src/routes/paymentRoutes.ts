import express from "express";
import {
  handleWebhook,
  initializePayment,
  verifyPayment,
} from "../controllers/paymentController.js";
import { optionalUserAuthenticate } from "../middleware/authenticationMiddleware.js";

const paymentRouter = express.Router();

paymentRouter.post("/paystack/payment", optionalUserAuthenticate, initializePayment);
paymentRouter.get("/paystack/verify/:reference", optionalUserAuthenticate, verifyPayment);
paymentRouter.post("/paystack/webhook", handleWebhook);

export default paymentRouter;
