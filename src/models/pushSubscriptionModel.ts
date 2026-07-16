import { Schema, model } from "mongoose";

const pushSubscriptionSchema = new Schema(
  {
    ownerType: { type: String, enum: ["user", "admin"], required: true, index: true },
    owner: { type: Schema.Types.ObjectId, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ ownerType: 1, owner: 1 });
export default model("PushSubscription", pushSubscriptionSchema);
