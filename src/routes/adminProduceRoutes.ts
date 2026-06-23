import express from "express";
import {
  activateProduce,
  createProduce,
  deleteProduce,
  editProduce,
  getAllProduce,
  suspendProduce,
} from "../controllers/adminProduceControllers.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  handleUploadErrors,
  uploadProduceImages,
} from "../middleware/uploadMiddleware.js";

const adminProduceRouter = express.Router();

adminProduceRouter.get("/", adminAuthenticate, getAllProduce);

adminProduceRouter.delete("/:produceId", adminAuthenticate, deleteProduce);

adminProduceRouter.patch(
  "/",
  adminAuthenticate,
  uploadProduceImages,
  handleUploadErrors,
  editProduce,
);

adminProduceRouter.post(
  "/activate/:produceId",
  adminAuthenticate,
  activateProduce,
);
adminProduceRouter.post(
  "/suspend/:produceId",
  adminAuthenticate,
  suspendProduce,
);

adminProduceRouter.post(
  "/",
  adminAuthenticate,
  uploadProduceImages,
  handleUploadErrors,
  createProduce,
);

export default adminProduceRouter;
