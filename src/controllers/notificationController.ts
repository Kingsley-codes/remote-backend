import { Request, Response } from "express";
import Notification from "../models/notificationModel.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import { addSseClient, sendUsersEvent } from "../services/sseService.js";

export async function produceInvestorIds(produceId: string) {
  return (await Investment.distinct("user", { produce: produceId, status: "ongoing", orderStatus: "confirmed" })).map(String);
}

export async function createProduceNotification(input: { produceId: string; title: string; message: string; type: "stage-change" | "admin"; adminId?: unknown }) {
  const recipients = await produceInvestorIds(input.produceId);
  const notification = await Notification.create({ title: input.title, message: input.message, type: input.type, produce: input.produceId, recipients, createdBy: input.adminId });
  await notification.populate("produce", "produceName title stage");
  sendUsersEvent(recipients, "notification", notification);
  return notification;
}

export const streamNotifications = async (req: Request, res: Response) => {
  const userId = String(req.user);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(`event: connected\ndata: {"ok":true}\n\n`);
  const remove = addSseClient(userId, res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25000);
  req.on("close", () => { clearInterval(heartbeat); remove(); });
};

export const listNotifications = async (req: Request, res: Response) => {
  const notifications = await Notification.find({ recipients: req.user }).populate("produce", "produceName title stage").sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, notifications: notifications.map((item) => ({ ...item, read: item.readBy.some((id) => String(id) === String(req.user)) })) });
};

export const markNotificationRead = async (req: Request, res: Response) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.notificationId, recipients: req.user }, { $addToSet: { readBy: req.user } }, { new: true });
  if (!notification) return res.status(404).json({ message: "Notification not found" });
  return res.json({ success: true });
};

export const adminCreateNotification = async (req: Request, res: Response) => {
  const produceId = String(req.body.produceId ?? "");
  const title = String(req.body.title ?? "").trim();
  const message = String(req.body.message ?? "").trim();
  if (!title || !message || title.length > 120 || message.length > 1000) return res.status(400).json({ message: "A title and message are required" });
  if (!await Produce.exists({ _id: produceId, status: "active" })) return res.status(404).json({ message: "Active produce not found" });
  const notification = await createProduceNotification({ produceId, title, message, type: "admin", adminId: req.admin });
  return res.status(201).json({ success: true, notification });
};
