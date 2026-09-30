// routes/admin/auditLogRoutes.ts
import express from "express";

import { adminAuthenticate, requireSuperAdmin } from "../middleware/authenticationMiddleware.js";
import {
  getAuditLogStats,
  exportAuditLogs,
  getAuditLogs,
} from "../controllers/auditLogController.js";

const router = express.Router();

router.use(adminAuthenticate, requireSuperAdmin);

router.get("/", getAuditLogs);
router.get("/stats", getAuditLogStats);
router.get("/export", exportAuditLogs);

export default router;
