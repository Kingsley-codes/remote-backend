import type { ClientSession } from "mongoose";
import type { Request, RequestHandler } from "express";
import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";
import AuditLog from "../models/auditLogModel.js";
import { logError } from "../utils/logger.js";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE"
  | "FUNDING_UPDATE"
  | "YIELD_MARKED"
  | "LOGIN"
  | "LOGOUT"
  | "PAYMENT_SETTLED";

export type AuditEntity =
  | "FARMER"
  | "PRODUCT"
  | "ORDER"
  | "USER"
  | "PAYMENT"
  | "WITHDRAWAL"
  | "ADMIN"
  | "TICKET"
  | "NOTIFICATION"
  | "POST"
  | "SYSTEM";

type AuditInput = {
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  actorType: "ADMIN" | "USER" | "SYSTEM";
  actorId: string;
  actorName?: string;
  actorEmail?: string;
  details?: string;
  changes?: { before?: unknown; after?: unknown; field?: string; oldValue?: unknown; newValue?: unknown };
  request?: Request;
  session?: ClientSession;
};

export async function writeAuditLog(input: AuditInput) {
  const record = {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    userId: input.actorId,
    userName: input.actorName || input.actorType.toLowerCase(),
    userEmail: input.actorEmail || "",
    actorType: input.actorType,
    changes: input.changes,
    ipAddress: input.request?.ip,
    userAgent: input.request?.get("user-agent")?.slice(0, 500),
    details: input.details?.slice(0, 1000),
  };
  if (input.session) {
    await AuditLog.create([record], { session: input.session });
    return;
  }
  await AuditLog.create(record);
}

export async function writeActorAudit(
  request: Request,
  input: Omit<AuditInput, "actorType" | "actorId" | "actorName" | "actorEmail" | "request">,
) {
  const adminId = request.admin?.toString();
  const userId = request.user?.toString();
  const actor = adminId
    ? await Admin.findById(adminId).select("firstName lastName email").lean()
    : userId
      ? await User.findById(userId).select("firstName lastName email").lean()
      : null;
  await writeAuditLog({
    ...input,
    actorType: adminId ? "ADMIN" : userId ? "USER" : "SYSTEM",
    actorId: adminId ?? userId ?? "system",
    ...(actor ? {
      actorName: `${actor.firstName} ${actor.lastName}`.trim(),
      actorEmail: actor.email,
    } : {}),
    request,
  });
}

const entityFromPath = (path: string): AuditEntity => {
  if (path.includes("farmer")) return "FARMER";
  if (path.includes("produce")) return "PRODUCT";
  if (path.includes("investment")) return "ORDER";
  if (path.includes("withdraw")) return "WITHDRAWAL";
  if (path.includes("payment")) return "PAYMENT";
  if (path.includes("ticket")) return "TICKET";
  if (path.includes("notification")) return "NOTIFICATION";
  if (path.includes("agri-learn")) return "POST";
  if (path.includes("user")) return "USER";
  return "ADMIN";
};

const actionFromMethod = (method: string): AuditAction =>
  method === "POST" ? "CREATE" : method === "DELETE" ? "DELETE" : "UPDATE";

export const auditAdminMutation: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  res.on("finish", () => {
    if (!req.admin || res.statusCode >= 400) return;
    const bodyId = req.body?.userId ?? req.body?.produceId ?? req.body?.farmerId;
    const pathId = req.originalUrl.split("?")[0]?.split("/").filter(Boolean).at(-1);
    void writeActorAudit(req, {
      action: actionFromMethod(req.method),
      entityType: entityFromPath(req.originalUrl),
      entityId: String(bodyId ?? pathId ?? "collection").slice(0, 200),
      details: `${req.method} ${req.originalUrl.split("?")[0]} completed with ${res.statusCode}`,
      changes: { after: { changedFields: Object.keys(req.body ?? {}).filter((key) => !/password|token|secret|otp/i.test(key)) } },
    }).catch((error) => logError("audit.write_failed", error, { path: req.originalUrl }));
  });
  next();
};
