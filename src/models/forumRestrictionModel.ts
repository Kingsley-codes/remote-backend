import { Schema, model } from "mongoose";

// Email is deliberately independent of the User record: account deletion must
// never remove a community restriction or permit re-registration to bypass it.
const schema = new Schema({
  room: { type: String, required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  kind: { type: String, enum: ["ban", "mute"], required: true },
  displayName: { type: String, required: true },
  roomTitle: { type: String, required: true },
  reason: { type: String, maxlength: 500, default: "" },
  moderatedBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
}, { timestamps: true });
schema.index({ room: 1, email: 1 }, { unique: true });
export default model("ForumRestriction", schema);
