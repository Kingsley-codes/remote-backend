import express from "express";
import compression from "compression";
import "dotenv/config";
import helmet from "helmet";
import passport from "passport";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import cors from "cors";
import authRouter from "./routes/userAuthRoutes.js";
import adminAuthRouter from "./routes/adminAuthRoutes.js";
import produceRouter from "./routes/produceRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import adminProduceRouter from "./routes/adminProduceRoutes.js";
import { sanitize } from "./middleware/mongodbSantizer.js";
import paymentRouter from "./routes/paymentRoutes.js";
import userRouter from "./routes/userRoutes.js";
import "./config/passport.js";
import adminDashboardRouter from "./routes/adminDashboardRoutes.js";
import userDashboardRouter from "./routes/userDashboardRoutes.js";
import devWithdrawRouter from "./routes/devWithdrawRoutes.js";
import { userTicketRouter, adminTicketRouter } from "./routes/ticketRoutes.js";
import { userPushRouter, adminPushRouter } from "./routes/pushRoutes.js";
import { agriLearnRouter, adminAgriLearnRouter } from "./routes/agriLearnRoutes.js";
import { referralRouter, adminReferralRouter } from "./routes/referralRoutes.js";
import forumRouter from "./routes/forumRoutes.js";
import { notificationRouter, adminNotificationRouter } from "./routes/notificationRoutes.js";
import auditLogRouter from "./routes/auditLogRoutes.js";
import { MongoRateLimitStore } from "./services/rateLimitStore.js";
import { auditAdminMutation } from "./services/auditService.js";

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  store: new MongoRateLimitStore("api"),
  skip: (req) => req.originalUrl.split("?")[0] === "/api/payment/paystack/webhook",
  message: "Too many requests from this IP, please try again later",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: new MongoRateLimitStore("auth-ip"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many authentication attempts. Please try again later." },
});

const accountAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore("auth-account"),
  skip: (req) => typeof req.body?.email !== "string",
  keyGenerator: (req) => crypto
    .createHash("sha256")
    .update(String(req.body.email).trim().toLowerCase())
    .digest("hex"),
  message: { status: "fail", message: "Too many attempts for this account. Please try again later." },
});

export const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_LOCALHOST,
].filter(Boolean) as string[];

const app = express();

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? "1");
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
}
app.set("trust proxy", trustProxyHops);

app.use("/api", passport.initialize());
app.use("/api", express.json({ limit: "1mb", verify: (req, _res, buffer) => {
  const request = req as express.Request;
  if (request.originalUrl === "/api/payment/paystack/webhook") {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
} }));
app.use("/api", compression());
app.use("/api", cookieParser());
app.use("/api", express.urlencoded({ extended: true }));
app.use("/api", helmet());
app.use("/api", limiter);
app.use((req, res, next) => {
  req.body = sanitize(req.body);
  req.params = sanitize(req.params);

  // Mutate req.query in-place without overwriting it
  for (const key in req.query) {
    if (key.startsWith("$") || key.includes(".")) {
      delete req.query[key];
    }
  }
  next();
});

app.use("/api/auth", authLimiter);
app.use("/api/auth", accountAuthLimiter);
app.use("/api/admin/auth", authLimiter);
app.use("/api/admin/auth", accountAuthLimiter);

if (process.env.NODE_ENV === "development") {
  app.use("/api/dev", devWithdrawRouter);
}

// Define API routes
app.use("/api/auth", authRouter); // Register auth routes
app.use("/api/user", userRouter); // Register user routes
app.use("/api/user/dashboard", userDashboardRouter); // Register user routes
app.use("/api/produce", produceRouter); // Register produce routes
app.use("/api/admin/auth", adminAuthRouter); // Register Admin auth routes
app.use("/api/admin", auditAdminMutation);
app.use("/api/admin", adminRouter); // Register Admin routes
app.use("/api/admin/produce", adminProduceRouter); // Register produce routes
app.use("/api/admin/dashboard", adminDashboardRouter); // Register Admin users routes
app.use("/api/payment", paymentRouter); // Register mentor dashboard routes
app.use("/api/tickets", userTicketRouter);
app.use("/api/admin/tickets", adminTicketRouter);
app.use("/api/push", userPushRouter);
app.use("/api/admin/push", adminPushRouter);
app.use("/api/agri-learn", agriLearnRouter);
app.use("/api/admin/agri-learn", adminAgriLearnRouter);
app.use("/api/referrals", referralRouter);
app.use("/api/admin/referrals", adminReferralRouter);
app.use("/api/forum", forumRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/admin/notifications", adminNotificationRouter);
app.use("/api/admin/audit-logs", auditLogRouter);

export default app;
