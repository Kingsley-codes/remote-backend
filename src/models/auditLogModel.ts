// models/auditLogModel.ts
import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const auditLogSchema = new Schema(
  {
    action: {
      type: String,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "STATUS_CHANGE",
        "FUNDING_UPDATE",
        "YIELD_MARKED",
        "LOGIN",
        "LOGOUT",
      ],
      required: true,
    },
    entityType: {
      type: String,
      enum: [
        "FARMER",
        "PRODUCT",
        "ORDER",
        "USER",
        "PAYMENT",
        "WITHDRAWAL",
        "ADMIN",
      ],
      required: true,
    },
    entityId: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    userRole: {
      type: String,
      enum: ["ADMIN", "SUPER_ADMIN", "FARMER", "BUYER"],
      required: true,
    },
    changes: {
      before: { type: Schema.Types.Mixed, default: null },
      after: { type: Schema.Types.Mixed, default: null },
      field: { type: String },
      oldValue: { type: Schema.Types.Mixed },
      newValue: { type: Schema.Types.Mixed },
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now },
    details: { type: String },
  },
  {
    timestamps: true,
  },
);

// Create indexes for faster queries
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ entityType: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ entityId: 1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export type AuditLogDocument = HydratedDocument<AuditLog>;

const AuditLog = model<AuditLogDocument>("AuditLog", auditLogSchema);

export default AuditLog;
