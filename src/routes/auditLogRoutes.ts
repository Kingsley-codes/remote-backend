// routes/admin/auditLogRoutes.ts
import express from "express";

import { adminAuthenticate } from "../middleware/authenticationMiddleware.js";
import {
  getAuditLogStats,
  exportAuditLogs,
  getAuditLogs,
} from "../controllers/auditLogController.js";

const router = express.Router();

router.use(adminAuthenticate);

router.get("/", getAuditLogs);
router.get("/stats", getAuditLogStats);
router.get("/export", exportAuditLogs);

export default router;
