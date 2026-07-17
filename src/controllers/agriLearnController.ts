import { Request, Response } from "express";
import AgriLearnPost from "../models/agriLearnPostModel.js";
import { uploadMediaToCloudinary } from "../middleware/uploadMiddleware.js";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const file = (req: Request, field: "heroImage" | "bodyMedia") =>
  (req.files as Record<string, Express.Multer.File[]> | undefined)?.[field]?.[0];

const uploadFile = async (uploaded?: Express.Multer.File) => {
  if (!uploaded) return undefined;
  const type = uploaded.mimetype.startsWith("video/") ? "video" : "image";
  const result = await uploadMediaToCloudinary(uploaded.buffer, "remote-agric/agri-learn", type);
  return { type, url: result.secure_url, publicId: result.public_id };
};

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
  });
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });
  const relatedPosts = await AgriLearnPost.find({
    _id: { $ne: post._id },
    status: "published",
    category: post.category,
  }).sort({ publishedAt: -1 }).limit(3).select("title slug excerpt category heroImage media publishedAt createdAt");
  return res.json({ success: true, data: { post, relatedPosts } });
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
  const heroImageFile = file(req, "heroImage");
  if (!heroImageFile || !heroImageFile.mimetype.startsWith("image/"))
    return res.status(400).json({ success: false, message: "A hero image is required" });
  const [heroImage, bodyMedia] = await Promise.all([
    uploadFile(heroImageFile),
    uploadFile(file(req, "bodyMedia")),
  ]);
  const post = await AgriLearnPost.create({
    title,
    slug,
    excerpt,
    content,
    category,
    status,
    heroImage,
    bodyMedia,
    publishedAt: status === "published" ? new Date() : undefined,
  });
  return res.status(201).json({ success: true, data: { post } });
};

export const updatePost = async (req: Request, res: Response) => {
  const post = await AgriLearnPost.findById(req.params.postId);
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });
  const heroImageFile = file(req, "heroImage");
  if (heroImageFile && !heroImageFile.mimetype.startsWith("image/"))
    return res.status(400).json({ success: false, message: "The hero media must be an image" });
  for (const key of [
    "title",
    "excerpt",
    "content",
    "category",
    "status",
  ] as const)
    if (req.body[key] !== undefined) (post as any)[key] = req.body[key];
  const [heroImage, bodyMedia] = await Promise.all([
    uploadFile(heroImageFile),
    uploadFile(file(req, "bodyMedia")),
  ]);
  if (heroImage) post.heroImage = heroImage as any;
  if (bodyMedia) post.bodyMedia = bodyMedia as any;
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
