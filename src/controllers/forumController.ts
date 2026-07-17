import { Request, Response } from "express";
import ForumMessage from "../models/forumMessageModel.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import User from "../models/userModel.js";
import { emitForumMessage } from "../realtime.js";

const roomFilter = (room: string) => room === "general" ? { roomType: "general" } : { roomType: "produce", produce: room };

async function canPost(userId: unknown, room: string) {
  if (!userId) return false;
  if (room === "general") return true;
  return Boolean(await Investment.exists({ user: userId, produce: room, status: "ongoing", orderStatus: "confirmed" }));
}

export const getRooms = async (_req: Request, res: Response) => {
  const produce = await Produce.find({ status: "active" }).select("produceName title stage image1").sort({ createdAt: -1 });
  return res.json({ success: true, rooms: [{ id: "general", title: "General", type: "general" }, ...produce.map((item) => ({ id: item.id, title: item.produceName, subtitle: item.title, type: "produce", stage: item.stage, image: item.image1?.url }))] });
};

export const getMessages = async (req: Request, res: Response) => {
  const room = String(req.params.room);
  if (room !== "general" && !await Produce.exists({ _id: room, status: "active" })) return res.status(404).json({ message: "Room not found" });
  const messages = await ForumMessage.find({ ...roomFilter(room), parent: null }).populate("author", "username firstName lastName profilePhoto").sort({ createdAt: -1 }).limit(100).lean();
  const ids = messages.map((message) => message._id);
  const replies = await ForumMessage.find({ parent: { $in: ids } }).populate("author", "username firstName lastName profilePhoto").sort({ createdAt: 1 }).lean();
  const byParent = new Map<string, typeof replies>();
  replies.forEach((reply) => { const key = String(reply.parent); byParent.set(key, [...(byParent.get(key) ?? []), reply]); });
  const user = req.user ? await User.findById(req.user).select("username").lean() : null;
  return res.json({ success: true, authenticated: Boolean(req.user), canPost: await canPost(req.user, room), username: user?.username, messages: messages.reverse().map((message) => ({ ...message, replies: byParent.get(String(message._id)) ?? [] })) });
};

export const createMessage = async (req: Request, res: Response) => {
  const userId = req.user;
  const room = String(req.params.room);
  const body = String(req.body.body ?? "").trim();
  const parentId = req.body.parentId as string | undefined;
  if (!userId) return res.status(401).json({ message: "Please sign in to post" });
  const user = await User.findById(userId);
  if (!user?.username) return res.status(409).json({ code: "USERNAME_REQUIRED", message: "Create a username before posting" });
  if (!body || body.length > 2000) return res.status(400).json({ message: "Message must be between 1 and 2000 characters" });
  if (!await canPost(userId, room)) return res.status(403).json({ message: "An active investment in this produce is required to post" });
  let parent = null;
  if (parentId) {
    parent = await ForumMessage.findOne({ _id: parentId, ...roomFilter(room), parent: null });
    if (!parent) return res.status(400).json({ message: "Replies can only be added to top-level messages" });
  }
  const names = [...body.matchAll(/@([a-z0-9_]{3,24})/gi)].map((match) => match[1]!.toLowerCase());
  const mentioned = await User.find({ username: { $in: names } }).select("_id");
  const message = await ForumMessage.create({ ...roomFilter(room), author: userId, body, parent: parent?._id ?? null, mentions: mentioned.map((item) => item._id) });
  await message.populate("author", "username firstName lastName profilePhoto");
  emitForumMessage(room, message);
  return res.status(201).json({ success: true, message });
};

export const setUsername = async (req: Request, res: Response) => {
  const username = String(req.body.username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ message: "Use 3-24 lowercase letters, numbers, or underscores" });
  try {
    const user = await User.findByIdAndUpdate(req.user, { username }, { new: true, runValidators: true }).select("username");
    return res.json({ success: true, username: user?.username });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ message: "That username is already taken" });
    return res.status(500).json({ message: "Unable to save username" });
  }
};
