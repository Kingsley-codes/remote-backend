// routes/dev.routes.ts  — only register this in development
import { Router } from "express";
import {
  handleTransferFailed,
  handleTransferSuccess,
} from "../helpers/paymentHelper.js";

const devWithdrawRouter = Router();

if (process.env.NODE_ENV === "development") {
  // Simulate Paystack sending transfer.success
  devWithdrawRouter.post("/mock-webhook/transfer-success", async (req, res) => {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: "reference is required" });
    }

    await handleTransferSuccess({ reference });
    return res.json({ success: true, message: "Transfer success simulated" });
  });

  // Simulate Paystack sending transfer.failed
  devWithdrawRouter.post("/mock-webhook/transfer-failed", async (req, res) => {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: "reference is required" });
    }

    await handleTransferFailed({ reference });
    return res.json({ success: true, message: "Transfer failure simulated" });
  });
}

export default devWithdrawRouter;
