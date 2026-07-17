import { Router } from "express";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  uploadPostMedia,
  handleUploadErrors,
} from "../middleware/uploadMiddleware.js";
import {
  listPublishedPosts,
  getPublishedPost,
  listAdminPosts,
  createPost,
  updatePost,
  deletePost,
} from "../controllers/agriLearnController.js";

export const agriLearnRouter = Router();
agriLearnRouter.get("/", listPublishedPosts);
agriLearnRouter.get("/:slug", getPublishedPost);

export const adminAgriLearnRouter = Router();
adminAgriLearnRouter.use(adminAuthenticate);
adminAgriLearnRouter.get("/", listAdminPosts);
adminAgriLearnRouter.post("/", uploadPostMedia, handleUploadErrors, createPost);
adminAgriLearnRouter.patch(
  "/:postId",
  uploadPostMedia,
  handleUploadErrors,
  updatePost,
);
adminAgriLearnRouter.delete("/:postId", deletePost);
