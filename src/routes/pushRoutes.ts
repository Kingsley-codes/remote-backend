import { Router } from "express";
import { adminAuthenticate, userAuthenticate } from "../middleware/authenticationMiddleware.js";
import { subscribeToPush, unsubscribeFromPush } from "../controllers/pushController.js";

export const userPushRouter = Router();
userPushRouter.use(userAuthenticate);
userPushRouter.post("/subscribe", subscribeToPush("user"));
userPushRouter.post("/unsubscribe", unsubscribeFromPush);

export const adminPushRouter = Router();
adminPushRouter.use(adminAuthenticate);
adminPushRouter.post("/subscribe", subscribeToPush("admin"));
adminPushRouter.post("/unsubscribe", unsubscribeFromPush);
