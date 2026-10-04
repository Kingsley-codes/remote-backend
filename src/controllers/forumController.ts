import { Request, Response } from "express";
import ForumMessage from "../models/forumMessageModel.js";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import ForumRestriction from "../models/forumRestrictionModel.js";
import { isValidObjectId } from "mongoose";
import { forumAccess, forumStatuses, normalizeForumEmail, restrictionKindForRoom, validForumRoom } from "../services/forumAccessService.js";
import { emitForumMessage, emitForumChange, refreshForumAccess } from "../realtime.js";

const roomFilter = (room: string) => room === "general" ? { roomType: "general" } : { roomType: "produce", produce: room };

export const getRooms = async (req: Request, res: Response) => {
  const produceIds = req.user
    ? await Investment.distinct("produce", { user: req.user, status: "ongoing", orderStatus: "confirmed" })
    : [];
  const produce = await Produce.find({ ...(req.admin ? {} : { _id: { $in: produceIds } }), status: { $in: forumStatuses } }).select("produceName title stage image1").sort({ createdAt: -1 });
  return res.json({ success: true, rooms: [{ id: "general", title: "General", type: "general" }, ...produce.map((item) => ({ id: item.id, title: item.produceName, subtitle: item.title, type: "produce", stage: item.stage, image: item.image1?.url }))] });
};

export const getMessages = async (req: Request, res: Response) => {
  const room = String(req.params.room);
  const access = await forumAccess(req.user, req.admin, room);
  if (!access.exists) return res.status(404).json({ message: "Room not found" });
  if (!access.canRead) return res.status(403).json({ authenticated: Boolean(req.user || req.admin), restriction: access.restriction, message: access.restriction === "ban" ? "You have been removed and banned from General. Contact support to request an unban." : "This room is only available to remote farmers who own this produce" });
  const messages = await ForumMessage.find({ ...roomFilter(room), parent: null }).populate("author", "username firstName lastName profilePhoto").sort({ createdAt: -1 }).limit(100).lean();
  const ids = messages.map((message) => message._id);
  const replies = await ForumMessage.find({ parent: { $in: ids } }).populate("author", "username firstName lastName profilePhoto").sort({ createdAt: 1 }).lean();
  const byParent = new Map<string, typeof replies>();
  replies.forEach((reply) => { const key = String(reply.parent); byParent.set(key, [...(byParent.get(key) ?? []), reply]); });
  const user = req.user ? await User.findById(req.user).select("username").lean() : null;
  return res.json({ success: true, authenticated: Boolean(req.user || req.admin), isAdmin: Boolean(req.admin), canPost: access.canPost, restriction: access.restriction, username: req.admin ? "Admin" : user?.username, messages: messages.reverse().map((message) => ({ ...message, replies: byParent.get(String(message._id)) ?? [] })) });
};

export const createMessage = async (req: Request, res: Response) => {
  const userId = req.admin || req.user;
  const room = String(req.params.room);
  const body = String(req.body.body ?? "").trim();
  const parentId = req.body.parentId as string | undefined;
  if (!userId) return res.status(401).json({ message: "Please sign in to post" });
  const access = await forumAccess(req.user, req.admin, room);
  if (!access.exists) return res.status(404).json({ message: "Room not found" });
  if (!access.canPost) return res.status(403).json({ message: access.restriction ? `You are ${access.restriction === "ban" ? "banned" : "muted"} in this room` : "Active ownership of this produce is required to post" });
  const user = req.admin ? await Admin.findById(userId) : await User.findById(userId);
  if (!req.admin && !(user && "username" in user && user.username)) return res.status(409).json({ code: "USERNAME_REQUIRED", message: "Create a username before posting" });
  if (!body || body.length > 2000) return res.status(400).json({ message: "Message must be between 1 and 2000 characters" });
  let parent = null;
  if (parentId) {
    if (!isValidObjectId(parentId)) return res.status(400).json({ message: "Invalid thread" });
    parent = await ForumMessage.findOne({ _id: parentId, ...roomFilter(room), parent: null });
    if (!parent) return res.status(400).json({ message: "Replies can only be added to top-level messages" });
  }
  const names = [...body.matchAll(/@([a-z0-9_]{3,24})/gi)].map((match) => match[1]!.toLowerCase());
  const mentioned = await User.find({ username: { $in: names } }).select("_id");
  const message = await ForumMessage.create({ ...roomFilter(room), author: userId, authorModel: req.admin ? "Admin" : "User", body, parent: parent?._id ?? null, mentions: mentioned.map((item) => item._id) });
  await message.populate("author", "username firstName lastName profilePhoto");
  emitForumMessage(room, message);
  return res.status(201).json({ success: true, message });
};

export const deleteMessage = async (req: Request, res: Response) => {
  const room = String(req.params.room);
  const id = String(req.params.messageId);
  if (!validForumRoom(room) || !isValidObjectId(id)) return res.status(400).json({ message: "Invalid room or message" });
  const message = await ForumMessage.findOneAndDelete({ _id: id, ...roomFilter(room) });
  if (!message) return res.status(404).json({ message: "Message not found" });
  // Removing a thread removes all its replies, too.
  if (!message.parent) await ForumMessage.deleteMany({ parent: message._id, ...roomFilter(room) });
  emitForumChange(room, { deletedId: id });
  return res.json({ success: true });
};

export const getRestrictions = async (_req: Request, res: Response) => {
  const restrictions = await ForumRestriction.find().sort({ createdAt: -1 }).lean();
  return res.json({ restrictions });
};

export const getRoomMembers = async (req: Request, res: Response) => {
  const room = String(req.params.room);
  if (!(await forumAccess(null, req.admin, room)).exists) return res.status(404).json({ message: "Room not found" });
  const search = String(req.query.search ?? "").trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ids = room === "general" ? null : await Investment.distinct("user", { produce: room, status: "ongoing", orderStatus: "confirmed" });
  const users = await User.find({ ...(ids ? { _id: { $in: ids } } : {}), ...(search ? { $or: ["email", "username", "firstName", "lastName"].map((key) => ({ [key]: { $regex: search, $options: "i" } })) } : {}) }).select("email username firstName lastName").sort({ email: 1 }).limit(50).lean();
  return res.json({ users });
};

export const restrictMember = async (req: Request, res: Response) => {
  const room = String(req.params.room);
  if (!validForumRoom(room) || !isValidObjectId(req.body.userId)) return res.status(400).json({ message: "Invalid room or user" });
  const kind = restrictionKindForRoom(room);
  if (req.body.kind !== kind) return res.status(400).json({ message: room === "general" ? "General supports removal and banning" : "Produce members can only be muted, never removed" });
  if (!(await forumAccess(null, req.admin, room)).exists) return res.status(404).json({ message: "Room not found" });
  const user = await User.findById(req.body.userId).select("email firstName lastName");
  if (!user) return res.status(404).json({ message: "User not found" });
  if (room !== "general" && !await Investment.exists({ user: user._id, produce: room, status: "ongoing", orderStatus: "confirmed" })) return res.status(400).json({ message: "User is not an active member of this room" });
  const produce = room === "general" ? null : await Produce.findById(room).select("produceName");
  const reason = String(req.body.reason ?? "").trim();
  if (reason.length > 500) return res.status(400).json({ message: "Reason must be 500 characters or fewer" });
  const restriction = await ForumRestriction.findOneAndUpdate({ room, email: normalizeForumEmail(user.email) }, { $set: { kind, displayName: `${user.firstName} ${user.lastName}`, roomTitle: produce?.produceName ?? "General", reason, moderatedBy: req.admin } }, { upsert: true, new: true, runValidators: true });
  await refreshForumAccess(room);
  return res.json({ restriction });
};

export const liftRestriction = async (req: Request, res: Response) => {
  const id = String(req.params.restrictionId);
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid restriction" });
  const restriction = await ForumRestriction.findByIdAndDelete(id);
  if (!restriction) return res.status(404).json({ message: "Restriction no longer exists" });
  await refreshForumAccess(restriction.room);
  return res.json({ success: true });
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
