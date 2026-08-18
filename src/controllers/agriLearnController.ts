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

const postTypes = ["blog", "podcast"] as const;
type PostType = (typeof postTypes)[number];

const normalizePostType = (value: unknown): PostType =>
  value === "podcast" ? "podcast" : "blog";

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const isYouTubeUrl = (value: string) => {
  if (!isValidHttpUrl(value)) return false;
  const host = new URL(value).hostname.replace(/^www\./, "");
  return ["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host);
};

const uploadFile = async (uploaded?: Express.Multer.File) => {
  if (!uploaded) return undefined;
  const type = uploaded.mimetype.startsWith("video/") ? "video" : "image";
  const result = await uploadMediaToCloudinary(uploaded.buffer, "remote-agric/agri-learn", type);
  return { type, url: result.secure_url, publicId: result.public_id };
};

export const listPublishedPosts = async (req: Request, res: Response) => {
  const postType = postTypes.includes(req.query.postType as PostType)
    ? (req.query.postType as PostType)
    : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 20);
  const query = postType ? { status: "published", postType } : { status: "published" };
  const finder = AgriLearnPost.find(query)
    .sort({ publishedAt: -1 })
    .select("-content");
  if (limit) finder.limit(limit);
  const posts = await finder;
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
  }).sort({ publishedAt: -1 }).limit(3).select("title slug postType excerpt category heroImage media videoUrl publishedAt createdAt");
  return res.json({ success: true, data: { post, relatedPosts } });
};

export const listAdminPosts = async (req: Request, res: Response) => {
  const posts = await AgriLearnPost.find().sort({ createdAt: -1 });
  res.json({ success: true, data: { posts } });
};

export const createPost = async (req: Request, res: Response) => {
  const { title, excerpt, content, category, status = "published", videoUrl } = req.body;
  const postType = normalizePostType(req.body.postType);
  if (!title?.trim() || !excerpt?.trim())
    return res.status(400).json({
      success: false,
      message: "Title and summary are required",
    });
  if (postType === "blog" && !content?.trim())
    return res.status(400).json({ success: false, message: "Article content is required" });
  if (postType === "podcast" && (!videoUrl?.trim() || !isYouTubeUrl(videoUrl.trim())))
    return res.status(400).json({ success: false, message: "A valid YouTube video link is required" });
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (await AgriLearnPost.exists({ slug })) slug = `${base}-${n++}`;
  const heroImageFile = file(req, "heroImage");
  if (postType === "blog" && (!heroImageFile || !heroImageFile.mimetype.startsWith("image/")))
    return res.status(400).json({ success: false, message: "A hero image is required" });
  if (heroImageFile && !heroImageFile.mimetype.startsWith("image/"))
    return res.status(400).json({ success: false, message: "The hero media must be an image" });
  const [heroImage, bodyMedia] = await Promise.all([
    uploadFile(heroImageFile),
    postType === "blog" ? uploadFile(file(req, "bodyMedia")) : undefined,
  ]);
  const post = await AgriLearnPost.create({
    title,
    slug,
    postType,
    excerpt,
    content: postType === "blog" ? content : undefined,
    videoUrl: postType === "podcast" ? videoUrl.trim() : undefined,
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
  const nextPostType = req.body.postType === undefined ? post.postType : normalizePostType(req.body.postType);
  if (nextPostType === "blog" && req.body.content !== undefined && !req.body.content?.trim())
    return res.status(400).json({ success: false, message: "Article content is required" });
  if (nextPostType === "podcast" && req.body.videoUrl !== undefined && !isYouTubeUrl(req.body.videoUrl.trim()))
    return res.status(400).json({ success: false, message: "A valid YouTube video link is required" });
  for (const key of [
    "title",
    "excerpt",
    "content",
    "videoUrl",
    "category",
    "status",
    "postType",
  ] as const)
    if (req.body[key] !== undefined) (post as any)[key] = req.body[key];
  const [heroImage, bodyMedia] = await Promise.all([
    uploadFile(heroImageFile),
    uploadFile(file(req, "bodyMedia")),
  ]);
  if (heroImage) post.heroImage = heroImage as any;
  if (bodyMedia) post.bodyMedia = bodyMedia as any;
  if (post.postType === "blog" && !post.content?.trim())
    return res.status(400).json({ success: false, message: "Article content is required" });
  if (post.postType === "blog" && !post.heroImage)
    return res.status(400).json({ success: false, message: "A hero image is required" });
  if (post.postType === "podcast" && (!post.videoUrl?.trim() || !isYouTubeUrl(post.videoUrl.trim())))
    return res.status(400).json({ success: false, message: "A valid YouTube video link is required" });
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
