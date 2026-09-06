import { Router } from "express";
import {
  adminAuthenticate,
  optionalUserAuthenticate,
  userAuthenticate,
} from "../middleware/authenticationMiddleware.js";
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
import {
  createPostComment,
  deletePostComment,
  listPostComments,
} from "../controllers/agriLearnCommentController.js";

export const agriLearnRouter = Router();
agriLearnRouter.get("/", listPublishedPosts);
agriLearnRouter.get("/:slug/comments", optionalUserAuthenticate, listPostComments);
agriLearnRouter.post("/:slug/comments", userAuthenticate, createPostComment);
agriLearnRouter.delete(
  "/:slug/comments/:commentId",
  userAuthenticate,
  deletePostComment,
);
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
