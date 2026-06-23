import express from "express";
import compression from "compression";
import "dotenv/config";
import helmet from "helmet";
import passport from "passport";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
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

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
});

const allowedOrigins = [
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

app.set("trust proxy", 1);

app.use("/api", passport.initialize());
app.use("/api", express.json());
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

if (process.env.NODE_ENV === "development") {
  app.use("/api/dev", devWithdrawRouter);
}

// Define API routes
app.use("/api/auth", authRouter); // Register auth routes
app.use("/api/user", userRouter); // Register user routes
app.use("/api/user/dashboard", userDashboardRouter); // Register user routes
app.use("/api/produce", produceRouter); // Register produce routes
app.use("/api/admin/auth", adminAuthRouter); // Register Admin auth routes
app.use("/api/admin", adminRouter); // Register Admin routes
app.use("/api/admin/produce", adminProduceRouter); // Register produce routes
app.use("/api/admin/dashboard", adminDashboardRouter); // Register Admin users routes
app.use("/api/payment", paymentRouter); // Register mentor dashboard routes

export default app;
