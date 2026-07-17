import { Schema, model, InferSchemaType } from "mongoose";

const notificationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    type: { type: String, enum: ["stage-change", "admin"], required: true },
    produce: { type: Schema.Types.ObjectId, ref: "Produce", required: true, index: true },
    recipients: [{ type: Schema.Types.ObjectId, ref: "User" }],
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);
notificationSchema.index({ recipients: 1, createdAt: -1 });
export type Notification = InferSchemaType<typeof notificationSchema>;
export default model("Notification", notificationSchema);
