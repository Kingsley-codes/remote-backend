import { isValidObjectId } from "mongoose";
import Produce from "../models/produceModel.js";
import Investment from "../models/investmentModel.js";
import User from "../models/userModel.js";
import ForumRestriction from "../models/forumRestrictionModel.js";

export const forumStatuses = ["active", "closed", "sold out"];
export const normalizeForumEmail = (email: string) => email.trim().toLowerCase();
export const validForumRoom = (room: string) => room === "general" || isValidObjectId(room);
export const restrictionKindForRoom = (room: string) => room === "general" ? "ban" : "mute";

export async function forumAccess(userId: unknown, adminId: unknown, room: string) {
  if (!validForumRoom(room) || (room !== "general" && !await Produce.exists({ _id: room, status: { $in: forumStatuses } }))) {
    return { exists: false, canRead: false, canPost: false, restriction: null };
  }
  if (adminId) return { exists: true, canRead: true, canPost: true, restriction: null };
  const user = userId ? await User.findById(userId).select("email").lean() : null;
  const restriction = user ? await ForumRestriction.findOne({ room, email: normalizeForumEmail(user.email) }).lean() : null;
  const member = Boolean(user && (room === "general" || await Investment.exists({
    user: userId,
    produce: room,
    status: "ongoing",
    orderStatus: "confirmed",
    communityRoomRemovedAt: { $exists: false },
  })));
  return { exists: true, canRead: (room === "general" || member) && restriction?.kind !== "ban", canPost: member && !restriction, restriction: restriction?.kind ?? null };
}
