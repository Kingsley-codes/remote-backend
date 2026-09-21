import multer, { FileFilterCallback } from "multer";
import { v2 as cloudinary } from "cloudinary";
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { Request, Response, NextFunction } from "express";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
const uploadDirectory = path.join(os.tmpdir(), "remote-agric-uploads");
await fs.mkdir(uploadDirectory, { recursive: true });

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoMimeTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
});

const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback,
) => {
  const allowed = imageMimeTypes.has(file.mimetype);
  if (!allowed) return callback(new Error("Only JPEG, PNG, and WEBP images are allowed"));
  callback(null, true);
};

const mediaFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback,
) => {
  const allowed = imageMimeTypes.has(file.mimetype) || videoMimeTypes.has(file.mimetype);
  if (!allowed) return callback(new Error("Only JPEG, PNG, WEBP, MP4, WEBM, and MOV media are allowed"));
  callback(null, true);
};

const uploader = (options: multer.Options) => multer({ storage, ...options });

export const uploadProduceImages = uploader({
  limits: { fileSize: MAX_IMAGE_SIZE, files: 3, fields: 20, parts: 25 },
  fileFilter: imageFilter,
}).fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "image3", maxCount: 1 },
]);

export const uploadProducerImages = uploader({
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 20, parts: 22 },
  fileFilter: imageFilter,
}).fields([{ name: "profilePhoto", maxCount: 1 }]);

export const uploadFiles = uploader({
  limits: { fileSize: MAX_IMAGE_SIZE, files: 5, fields: 20, parts: 30 },
  fileFilter: imageFilter,
}).fields([{ name: "files", maxCount: 5 }]);

export const uploadTicketImages = uploader({
  limits: { fileSize: MAX_IMAGE_SIZE, files: 4, fields: 20, parts: 30 },
  fileFilter: imageFilter,
}).fields([{ name: "images", maxCount: 4 }]);

export const uploadPostMedia = uploader({
  limits: { fileSize: MAX_VIDEO_SIZE, files: 2, fields: 20, parts: 25 },
  fileFilter: mediaFilter,
}).fields([
  { name: "heroImage", maxCount: 1 },
  { name: "bodyMedia", maxCount: 1 },
]);

const allUploadedFiles = (req: Request) => {
  if (!req.files) return [];
  return Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
};

const removeTemporaryFile = async (file: Express.Multer.File) => {
  if (!file.path) return;
  await fs.unlink(file.path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
};

export const cleanupUploadedFiles = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.on("finish", () => {
    void Promise.allSettled(allUploadedFiles(req).map(removeTemporaryFile));
  });
  next();
};

const validateContent = async (
  file: Express.Multer.File,
  resourceType: "image" | "video",
) => {
  const detected = await fileTypeFromFile(file.path);
  const allowed = resourceType === "image" ? imageMimeTypes : videoMimeTypes;
  const sizeLimit = resourceType === "image" ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (!detected || !allowed.has(detected.mime) || file.size > sizeLimit) {
    throw new Error(`Uploaded file content is not an allowed ${resourceType}`);
  }
};

export const uploadMediaToCloudinary = async (
  file: Express.Multer.File,
  folder: string,
  resourceType: "image" | "video",
) => {
  try {
    await validateContent(file, resourceType);
    return await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("Cloudinary upload failed"));
          resolve(result);
        },
      );
      createReadStream(file.path).on("error", reject).pipe(stream);
    });
  } finally {
    await removeTemporaryFile(file);
  }
};

export const uploadToCloudinary = (
  file: Express.Multer.File,
  folder: string,
) => uploadMediaToCloudinary(file, folder, "image");

export const handleUploadErrors = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: err.code === "LIMIT_FILE_SIZE"
        ? "Uploaded file exceeds the allowed size"
        : "Invalid upload request",
    });
    return;
  }
  if (err) {
    res.status(400).json({ error: "Invalid uploaded file" });
    return;
  }
  next();
};

export const deleteFromCloudinary = (publicId: string) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
