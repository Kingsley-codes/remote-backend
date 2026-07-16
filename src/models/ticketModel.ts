import { Schema, model, Types, InferSchemaType } from "mongoose";

const attachmentSchema = new Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true } },
  { _id: false },
);

const messageSchema = new Schema(
  {
    senderType: { type: String, enum: ["user", "admin"], required: true },
    sender: { type: Schema.Types.ObjectId, required: true },
    body: { type: String, trim: true, maxlength: 4000, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true },
);

const ticketSchema = new Schema(
  {
    ticketNumber: { type: String, unique: true, index: true, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 140 },
    category: {
      type: String,
      enum: ["investment", "payment", "account", "farm-update", "other"],
      default: "other",
    },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    status: { type: String, enum: ["open", "resolved", "closed"], default: "open", index: true },
    messages: { type: [messageSchema], default: [] },
    resolvedAt: Date,
    closedAt: Date,
    expiresAt: Date,
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

ticketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ticketSchema.index({ user: 1, lastMessageAt: -1 });
ticketSchema.index({ status: 1, lastMessageAt: -1 });

export type TicketDocument = InferSchemaType<typeof ticketSchema> & { _id: Types.ObjectId };
export default model("Ticket", ticketSchema);
