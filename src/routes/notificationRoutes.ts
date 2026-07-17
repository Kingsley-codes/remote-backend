import express from "express";
import { adminCreateNotification, listNotifications, markNotificationRead, streamNotifications } from "../controllers/notificationController.js";
import { adminAuthenticate, userAuthenticate } from "../middleware/authenticationMiddleware.js";
export const notificationRouter = express.Router();
notificationRouter.get("/", userAuthenticate, listNotifications);
notificationRouter.get("/stream", userAuthenticate, streamNotifications);
notificationRouter.patch("/:notificationId/read", userAuthenticate, markNotificationRead);
export const adminNotificationRouter = express.Router();
adminNotificationRouter.post("/", adminAuthenticate, adminCreateNotification);
