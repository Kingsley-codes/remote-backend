import express from "express";
import { fetchUserProfile } from "../controllers/userController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";

const userRouter = express.Router();

userRouter.get("/profile", userAuthenticate, fetchUserProfile);

export default userRouter;
