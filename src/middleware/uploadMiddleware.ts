import multer, { FileFilterCallback } from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { Request, Response, NextFunction } from "express";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ALLOWED MIME TYPES
const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

const startsWith = (buffer: Buffer, bytes: number[]) =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const isImageBuffer = (buffer: Buffer) =>
  startsWith(buffer, [0xff, 0xd8, 0xff]) ||
  startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
  (buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP");

const isVideoBuffer = (buffer: Buffer) =>
  (buffer.length >= 8 && buffer.subarray(4, 8).toString() === "ftyp") ||
  startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);

// COMMON FILE FILTER
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPG, PNG, JPEG, and WEBP images are allowed.",
      ) as any,
      false,
    );
  }
};

const produceStorage = multer.memoryStorage();
export const uploadProduceImages = multer({
  storage: produceStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 3, fields: 20, parts: 25 },
  fileFilter,
}).fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "image3", maxCount: 1 },
]);

export const uploadProducerImages = multer({
  storage: produceStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 20, parts: 22 },
  fileFilter,
}).fields([{ name: "profilePhoto", maxCount: 1 }]);

export const uploadFiles = multer({
  storage: produceStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 5, fields: 20, parts: 30 },
  fileFilter,
}).fields([{ name: "files", maxCount: 5 }]);

export const uploadTicketImages = multer({
  storage: produceStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 4, fields: 20, parts: 30 },
  fileFilter,
}).fields([{ name: "images", maxCount: 4 }]);

const postMediaFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowed = [...allowedMimeTypes, "video/mp4", "video/webm", "video/quicktime"];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only JPG, PNG, WEBP, MP4, WEBM, and MOV media are allowed") as any, false);
};

export const uploadPostMedia = multer({
  storage: produceStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 2, fields: 20, parts: 25 },
  fileFilter: postMediaFilter,
}).fields([
  { name: "heroImage", maxCount: 1 },
  { name: "bodyMedia", maxCount: 1 },
]);

export const uploadMediaToCloudinary = (fileBuffer: Buffer, folder: string, resourceType: "image" | "video") =>
  new Promise<CloudinaryUploadResult>((resolve, reject) => {
    if (resourceType === "image" ? !isImageBuffer(fileBuffer) : !isVideoBuffer(fileBuffer)) {
      return reject(new Error("Uploaded file content does not match an allowed media type"));
    }
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: resourceType }, (error, result) => {
      if (error) return reject(error);
      if (!result) return reject(new Error("Cloudinary upload failed"));
      resolve(result);
    });
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });

// 🚧 Middleware wrapper to catch Multer errors cleanly
export const handleUploadErrors = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res
        .status(400)
        .json({ error: "File too large. Maximum size is 5 MB per file." });
      return;
    }
    res.status(400).json({ error: "Invalid upload request" });
    return;
  } else if (err) {
    res.status(400).json({ error: "Invalid uploaded file" });
    return;
  }
  next();
};

// Helper function to upload a file buffer to Cloudinary
export const uploadToCloudinary = (
  fileBuffer: Buffer,
  folder: string,
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    if (!isImageBuffer(fileBuffer)) {
      return reject(new Error("Uploaded file content does not match an allowed image type"));
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);

        if (!result) {
          return reject(new Error("Cloudinary upload failed: no result"));
        }
        resolve(result);
      },
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

export const deleteFromCloudinary = (publicId: string) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};
