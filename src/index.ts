import "dotenv/config";
import app, { allowedOrigins } from "./app.js";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { closeExpiredResolvedTickets } from "./controllers/ticketController.js";
import { deleteExpiredNotifications } from "./controllers/notificationController.js";
import { createServer } from "node:http";
import { initializeRealtime, refreshForumAccess } from "./realtime.js";
import { logError, logInfo } from "./utils/logger.js";
import { deliverWithdrawalEmails } from "./services/withdrawalNotificationService.js";
import { removeExpiredCommunityRoomAccess } from "./services/communityRoomExpiryService.js";

const dev = process.env.NODE_ENV !== "production";

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is not defined");
}

// Connect to MongoDB Atlas
try {
  await mongoose.connect(MONGO_URI);
  logInfo("mongodb.connected");
  await closeExpiredResolvedTickets();
  await deleteExpiredNotifications();
  const refreshExpiredCommunityRooms = async () => {
    const rooms = await removeExpiredCommunityRoomAccess();
    await Promise.all(rooms.map((room) => refreshForumAccess(room)));
  };
  await refreshExpiredCommunityRooms();
  void deliverWithdrawalEmails();
  setInterval(() => void deliverWithdrawalEmails(), 60_000).unref();
  setInterval(() => void closeExpiredResolvedTickets(), 60 * 60 * 1000).unref();
  setInterval(() => void deleteExpiredNotifications(), 60 * 60 * 60 * 1000).unref();
  // Runs once at startup and then every day. An investment is removed only
  // after its own 30-day grace period, so other active tracks still count.
  setInterval(() => void refreshExpiredCommunityRooms(), 24 * 60 * 60 * 1000).unref();
} catch (error) {
  logError("mongodb.connection_failed", error);
  process.exit(1);
}

// Define a simple route for testing
app.get("/api", (req: Request, res: Response) => {
  res.json({ message: "Hello from Express API!" });
});

const httpServer = createServer(app);
initializeRealtime(httpServer, allowedOrigins);
httpServer.listen(PORT, () => {
  logInfo("server.started", { port: Number(PORT) });
});

app.use((err: any, req: any, res: any, next: any) => {
  logError("http.unhandled_error", err, { method: req.method, path: req.originalUrl });
  res.status(500).json({
    status: "error",
    message: "Internal Server Error",
  });
});
