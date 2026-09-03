import express from "express";
import { fetchUserProfile, updateUserProfile } from "../controllers/userController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";

const userRouter = express.Router();

userRouter.get("/profile", userAuthenticate, fetchUserProfile);
userRouter.patch("/profile", userAuthenticate, updateUserProfile);

export default userRouter;
