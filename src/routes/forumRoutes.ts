import express from "express";
import { createMessage, getMessages, getRooms, setUsername, deleteMessage, getRestrictions, getRoomMembers, restrictMember, liftRestriction } from "../controllers/forumController.js";
import { optionalForumAuthenticate, userAuthenticate, adminAuthenticate } from "../middleware/authenticationMiddleware.js";

const router = express.Router();
router.get("/rooms", optionalForumAuthenticate, getRooms);
router.get("/rooms/:room/messages", optionalForumAuthenticate, getMessages);
router.post("/rooms/:room/messages", optionalForumAuthenticate, createMessage);
router.delete("/rooms/:room/messages/:messageId", adminAuthenticate, deleteMessage);
router.get("/moderation", adminAuthenticate, getRestrictions);
router.get("/rooms/:room/members", adminAuthenticate, getRoomMembers);
router.post("/rooms/:room/restrictions", adminAuthenticate, restrictMember);
router.delete("/moderation/:restrictionId", adminAuthenticate, liftRestriction);
router.patch("/username", userAuthenticate, setUsername);
export default router;
