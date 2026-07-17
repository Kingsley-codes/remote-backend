import { Request, Response } from "express";
import AgriLearnPost from "../models/agriLearnPostModel.js";
import { uploadMediaToCloudinary } from "../middleware/uploadMiddleware.js";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const files = (req: Request) =>
  (req.files as Record<string, Express.Multer.File[]> | undefined)?.media ?? [];

const upload = (req: Request) =>
  Promise.all(
    files(req).map(async (file) => {
      const type = file.mimetype.startsWith("video/") ? "video" : "image";
      const result = await uploadMediaToCloudinary(
        file.buffer,
        "remote-agric/agri-learn",
        type,
      );
      return { type, url: result.secure_url, publicId: result.public_id };
    }),
  );

export const listPublishedPosts = async (req: Request, res: Response) => {
  const posts = await AgriLearnPost.find({ status: "published" })
    .sort({ publishedAt: -1 })
    .select("-content");
  return res.json({ success: true, data: { posts } });
};

export const getPublishedPost = async (req: Request, res: Response) => {
  const post = await AgriLearnPost.findOne({
    slug: req.params.slug,
    status: "published",
  }).populate("author", "firstName lastName name");
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });
  return res.json({ success: true, data: { post } });
};

export const listAdminPosts = async (req: Request, res: Response) => {
  const posts = await AgriLearnPost.find().sort({ createdAt: -1 });
  res.json({ success: true, data: { posts } });
};

export const createPost = async (req: Request, res: Response) => {
  const { title, excerpt, content, category, status = "published" } = req.body;
  if (!title?.trim() || !excerpt?.trim() || !content?.trim())
    return res.status(400).json({
      success: false,
      message: "Title, excerpt and content are required",
    });
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (await AgriLearnPost.exists({ slug })) slug = `${base}-${n++}`;
  const post = await AgriLearnPost.create({
    title,
    slug,
    excerpt,
    content,
    category,
    status,
    author: req.admin,
    media: await upload(req),
    publishedAt: status === "published" ? new Date() : undefined,
  });
  return res.status(201).json({ success: true, data: { post } });
};

export const updatePost = async (req: Request, res: Response) => {
  const post = await AgriLearnPost.findById(req.params.postId);
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });
  const uploaded = await upload(req);
  for (const key of [
    "title",
    "excerpt",
    "content",
    "category",
    "status",
  ] as const)
    if (req.body[key] !== undefined) (post as any)[key] = req.body[key];
  if (uploaded.length) post.media.push(...(uploaded as any));
  if (post.status === "published" && !post.publishedAt)
    post.publishedAt = new Date();
  await post.save();
  return res.json({ success: true, data: { post } });
};

export const deletePost = async (req: Request, res: Response) => {
  const post = await AgriLearnPost.findByIdAndDelete(req.params.postId);
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });
  return res.json({ success: true });
};
