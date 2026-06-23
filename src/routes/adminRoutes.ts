import express from "express";
import { fetchAdminProfile } from "../controllers/adminController.js";
import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";

const adminRouter = express.Router();

adminRouter.get("/profile", adminAuthenticate, fetchAdminProfile);

export default adminRouter;
