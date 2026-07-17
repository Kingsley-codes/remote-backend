import { Router } from "express";
import {
  userAuthenticate,
  adminAuthenticate,
} from "../middleware/authenticationMiddleware.js";
import {
  uploadTicketImages,
  handleUploadErrors,
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
  uploadTicketImages,
  handleUploadErrors,
  createTicket,
);
userTicketRouter.get("/:ticketId", getUserTicket);
userTicketRouter.post(
  "/:ticketId/messages",
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
  uploadTicketImages,
  handleUploadErrors,
  addAdminMessage,
);
adminTicketRouter.patch("/:ticketId/status", updateTicketStatus);
