import type { ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import axios from "axios";
import Notification from "../models/notificationModel.js";
import WithdrawalEmail from "../models/withdrawalEmailModel.js";
import Transaction from "../models/transactionModel.js";
import User from "../models/userModel.js";
import { sendManualWithdrawalEmail } from "./emailService.js";
import { sendUserEvent } from "./sseService.js";
import { logError } from "../utils/logger.js";

export async function queueWithdrawalNotifications(withdrawal: InstanceType<typeof Transaction>, event: "requested" | "approved", session: ClientSession) {
  const eventKey = `withdrawal:${withdrawal._id}:${event}`;
  const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(withdrawal.amount);
  const [notice] = await Notification.create([{
    eventKey, type: "withdrawal", transaction: withdrawal._id, recipients: [withdrawal.user],
    title: event === "requested" ? "Withdrawal request received" : "Withdrawal completed",
    message: event === "requested"
      ? `Your withdrawal request for ${amount} (${withdrawal.transactionID}) is being processed and will be completed within 24 hours.`
      : `Your withdrawal of ${amount} (${withdrawal.transactionID}) has been completed. Your payment receipt will be sent by email.`,
  }], { session });
  await WithdrawalEmail.create([{ eventKey, transaction: withdrawal._id, event }], { session });
  return notice;
}

export function publishWithdrawalNotification(notice: InstanceType<typeof Notification> | undefined) {
  if (!notice) return;
  try { notice.recipients.forEach(user => sendUserEvent(String(user), "notification", notice)); }
  catch (error) { logError("withdrawal.notification_stream_failed", error); }
}

// Persisted jobs survive restarts. A lease prevents concurrent workers from sending the same job.
export async function deliverWithdrawalEmails(transactionId?: string) {
  try {
    for (let index = 0; index < 20; index++) {
      const now = new Date();
      const token = randomUUID();
      const job = await WithdrawalEmail.findOneAndUpdate({
        ...(transactionId ? { transaction: transactionId } : {}),
        $or: [{ status: "pending", nextAttempt: { $lte: now } }, { status: "sending", lockedUntil: { $lte: now } }],
      }, { $set: { status: "sending", lockToken: token, lockedUntil: new Date(Date.now() + 10 * 60_000) }, $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: 1 } });
      if (!job) break;
      try {
        const withdrawal = await Transaction.findById(job.transaction);
        if (!withdrawal) throw new Error("Withdrawal not found for email");
        const user = await User.findById(withdrawal.user).select("email firstName");
        if (!user?.email) throw new Error("Withdrawal recipient not found");
        let receipt;
        if (job.event === "approved") {
          const stored = withdrawal.withdrawalReceipt;
          if (!stored) throw new Error("Completed withdrawal receipt missing");
          const url = new URL(stored.url);
          if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") throw new Error("Invalid receipt host");
          const response = await axios.get<ArrayBuffer>(stored.url, {
            responseType: "arraybuffer", timeout: 30_000, maxContentLength: 5 * 1024 * 1024, maxRedirects: 0,
          });
          receipt = { fileName: stored.fileName, mimeType: stored.mimeType, content: Buffer.from(response.data) };
        }
        await sendManualWithdrawalEmail(user.email, user.firstName, {
          transactionID: withdrawal.transactionID, amount: withdrawal.amount, event: job.event,
          ...(receipt ? { receipt } : {}),
        });
        await WithdrawalEmail.updateOne({ _id: job._id, lockToken: token }, { $set: { status: "sent", sentAt: new Date() }, $unset: { lockedUntil: 1, lockToken: 1 } });
      } catch (error) {
        logError("withdrawal.email_failed", error, { transactionId: String(job.transaction), event: job.event });
        await WithdrawalEmail.updateOne({ _id: job._id, lockToken: token }, {
          $set: { status: "pending", nextAttempt: new Date(Date.now() + Math.min(60, 2 ** Math.min(job.attempts, 6)) * 60_000) },
          $unset: { lockedUntil: 1, lockToken: 1 },
        });
      }
    }
  } catch (error) { logError("withdrawal.email_queue_failed", error); }
}
