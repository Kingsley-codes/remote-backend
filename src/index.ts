import "dotenv/config";
import app, { allowedOrigins } from "./app.js";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { closeExpiredResolvedTickets } from "./controllers/ticketController.js";
import { deleteExpiredNotifications } from "./controllers/notificationController.js";
import { createServer } from "node:http";
import { initializeRealtime } from "./realtime.js";

const dev = process.env.NODE_ENV !== "production";

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is not defined");
}

// Connect to MongoDB Atlas
try {
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB Connected Successfully");
  await closeExpiredResolvedTickets();
  await deleteExpiredNotifications();
  setInterval(() => void closeExpiredResolvedTickets(), 60 * 60 * 1000).unref();
  setInterval(() => void deleteExpiredNotifications(), 60 * 60 * 60 * 1000).unref();
} catch (error) {
  console.error("MongoDB Connection Error:", error);
  process.exit(1);
}

// Define a simple route for testing
app.get("/api", (req: Request, res: Response) => {
  res.json({ message: "Hello from Express API!" });
});

const httpServer = createServer(app);
initializeRealtime(httpServer, allowedOrigins);
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled request error", { method: req.method, path: req.originalUrl, error: err?.message });
  res.status(500).json({
    status: "error",
    message: "Internal Server Error",
  });
});
