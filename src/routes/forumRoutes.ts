import express from "express";
import { createMessage, getMessages, getRooms, setUsername } from "../controllers/forumController.js";
import { optionalUserAuthenticate, userAuthenticate } from "../middleware/authenticationMiddleware.js";

const router = express.Router();
router.get("/rooms", getRooms);
router.get("/rooms/:room/messages", optionalUserAuthenticate, getMessages);
router.post("/rooms/:room/messages", userAuthenticate, createMessage);
router.patch("/username", userAuthenticate, setUsername);
export default router;
