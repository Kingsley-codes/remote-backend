import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import AgriLearnComment from "../models/agriLearnCommentModel.js";
import AgriLearnPost from "../models/agriLearnPostModel.js";
import type { AgriLearnCommentRequestBody } from "../interface/allInterfaces.js";

const authorFields = "username firstName lastName profilePhoto";

export const listPostComments = async (req: Request, res: Response) => {
  const post = await AgriLearnPost.findOne({
    slug: req.params.slug,
    status: "published",
  }).select("_id");

  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  const comments = await AgriLearnComment.find({ post: post._id })
    .populate("author", authorFields)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const viewerId = req.user ? String(req.user) : undefined;
  const visibleComments = comments.map((comment) => ({
    ...comment,
    isMine: viewerId === String(comment.author?._id),
  }));

  return res.json({
    success: true,
    data: { comments: visibleComments, authenticated: Boolean(req.user) },
  });
};

export const createPostComment = async (
  req: Request<
    { slug: string },
    unknown,
    AgriLearnCommentRequestBody
  >,
  res: Response,
) => {
  const body = String(req.body.body ?? "").trim();

  if (!req.user) {
    return res.status(401).json({ success: false, message: "Please sign in to comment" });
  }
  if (!body || body.length > 1500) {
    return res.status(400).json({
      success: false,
      message: "Comment must be between 1 and 1500 characters",
    });
  }

  const post = await AgriLearnPost.findOne({
    slug: req.params.slug,
    status: "published",
  }).select("_id");
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  const comment = await AgriLearnComment.create({
    post: post._id,
    author: req.user,
    body,
  });
  await comment.populate("author", authorFields);

  return res.status(201).json({
    success: true,
    data: { comment: { ...comment.toObject(), isMine: true } },
  });
};

export const deletePostComment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Please sign in" });
  }
  if (!isValidObjectId(req.params.commentId)) {
    return res.status(404).json({ success: false, message: "Comment not found" });
  }

  const post = await AgriLearnPost.findOne({
    slug: req.params.slug,
    status: "published",
  }).select("_id");
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  const comment = await AgriLearnComment.findOneAndDelete({
    _id: req.params.commentId,
    post: post._id,
    author: req.user,
  });
  if (!comment) {
    return res.status(404).json({ success: false, message: "Comment not found" });
  }

  return res.json({ success: true });
};
