import express from "express";
import { fetchUserProfile, updateUserProfile } from "../controllers/userController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";

import { uploadProducerImages, cleanupUploadedFiles, handleUploadErrors } from "../middleware/uploadMiddleware.js";

const userRouter = express.Router();

userRouter.get("/profile", userAuthenticate, fetchUserProfile);
userRouter.patch("/profile", userAuthenticate, cleanupUploadedFiles, uploadProducerImages, handleUploadErrors, updateUserProfile);

export default userRouter;
