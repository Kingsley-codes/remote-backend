import express from "express";
import {
  activateProduce,
  createProduce,
  deleteProduce,
  editProduce,
  getAllProduce,
  suspendProduce,
  updateProduceStage,
  updateTrackStage,
  updateProduceStatus,
} from "../controllers/adminProduceControllers.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  handleUploadErrors,
  cleanupUploadedFiles,
  uploadProduceImages,
} from "../middleware/uploadMiddleware.js";

const adminProduceRouter = express.Router();

adminProduceRouter.get("/", adminAuthenticate, getAllProduce);

adminProduceRouter.delete("/:produceId", adminAuthenticate, deleteProduce);

adminProduceRouter.patch(
  "/",
  adminAuthenticate,
  cleanupUploadedFiles,
  uploadProduceImages,
  handleUploadErrors,
  editProduce,
);

adminProduceRouter.post(
  "/activate/:produceId",
  adminAuthenticate,
  activateProduce,
);
adminProduceRouter.patch("/:produceID/status", adminAuthenticate, updateProduceStatus);
adminProduceRouter.patch("/:produceID/stage", adminAuthenticate, updateProduceStage);
adminProduceRouter.patch("/:produceID/tracks/:trackID/stage", adminAuthenticate, updateTrackStage);
adminProduceRouter.post(
  "/suspend/:produceId",
  adminAuthenticate,
  suspendProduce,
);

adminProduceRouter.post(
  "/",
  adminAuthenticate,
  cleanupUploadedFiles,
  uploadProduceImages,
  handleUploadErrors,
  createProduce,
);

export default adminProduceRouter;
