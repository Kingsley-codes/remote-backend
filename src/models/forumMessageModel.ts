import { Schema, model, InferSchemaType } from "mongoose";

const forumMessageSchema = new Schema(
  {
    roomType: { type: String, enum: ["general", "produce"], required: true, index: true },
    produce: { type: Schema.Types.ObjectId, ref: "Produce", index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    parent: { type: Schema.Types.ObjectId, ref: "ForumMessage", default: null, index: true },
    mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

forumMessageSchema.index({ roomType: 1, produce: 1, parent: 1, createdAt: -1 });
export type ForumMessage = InferSchemaType<typeof forumMessageSchema>;
export default model("ForumMessage", forumMessageSchema);
