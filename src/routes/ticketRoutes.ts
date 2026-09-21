import { Router } from "express";
import {
  userAuthenticate,
  adminAuthenticate,
} from "../middleware/authenticationMiddleware.js";
import {
  uploadTicketImages,
  handleUploadErrors,
  cleanupUploadedFiles,
} from "../middleware/uploadMiddleware.js";
import {
  createTicket,
  getUserTickets,
  getUserTicket,
  addUserMessage,
  getAdminTickets,
  getAdminTicket,
  addAdminMessage,
  updateTicketStatus,
} from "../controllers/ticketController.js";

export const userTicketRouter = Router();
userTicketRouter.use(userAuthenticate);
userTicketRouter.get("/", getUserTickets);
userTicketRouter.post(
  "/",
  cleanupUploadedFiles,
  uploadTicketImages,
  handleUploadErrors,
  createTicket,
);
userTicketRouter.get("/:ticketId", getUserTicket);
userTicketRouter.post(
  "/:ticketId/messages",
  cleanupUploadedFiles,
  uploadTicketImages,
  handleUploadErrors,
  addUserMessage,
);

export const adminTicketRouter = Router();
adminTicketRouter.use(adminAuthenticate);
adminTicketRouter.get("/", getAdminTickets);
adminTicketRouter.get("/:ticketId", getAdminTicket);
adminTicketRouter.post(
  "/:ticketId/messages",
  cleanupUploadedFiles,
  uploadTicketImages,
  handleUploadErrors,
  addAdminMessage,
);
adminTicketRouter.patch("/:ticketId/status", updateTicketStatus);
