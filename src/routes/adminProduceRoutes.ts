import express from "express";
import {
  addProduceTrack,
  activateProduce,
  createProduce,
  deleteProduceTrack,
  deleteProduce,
  editProduce,
  getAllProduce,
  suspendProduce,
  updateProduceStage,
  updateTrackStage,
  updateTrackStatus,
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
  "/:produceId",
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
adminProduceRouter.patch(
  "/:produceID/stage",
  adminAuthenticate,
  updateProduceStage,
);
adminProduceRouter.post(
  "/:produceID/tracks",
  adminAuthenticate,
  addProduceTrack,
);
adminProduceRouter.delete(
  "/:produceID/tracks/:trackID",
  adminAuthenticate,
  deleteProduceTrack,
);
adminProduceRouter.patch(
  "/:produceID/tracks/:trackID/stage",
  adminAuthenticate,
  updateTrackStage,
);
adminProduceRouter.patch(
  '/:produceID/tracks/:trackID/status',
  adminAuthenticate,
  updateTrackStatus,
);
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
