import express from "express";
import {
  handleWebhook,
  initializePayment,
  verifyPayment,
} from "../controllers/paymentController.js";

const paymentRouter = express.Router();

paymentRouter.post("/paystack/payment", initializePayment);
paymentRouter.get("/paystack/verify/:reference", verifyPayment);
paymentRouter.post("/paystack/webhook", handleWebhook);

export default paymentRouter;
