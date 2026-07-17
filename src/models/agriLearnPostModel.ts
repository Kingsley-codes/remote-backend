import { Schema, model } from "mongoose";

const mediaSchema = new Schema({
  type: { type: String, enum: ["image", "video"], required: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
}, { _id: false });

const postSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, unique: true, index: true },
  excerpt: { type: String, required: true, trim: true, maxlength: 320 },
  content: { type: String, required: true, trim: true, maxlength: 50000 },
  category: { type: String, required: true, trim: true, default: "Agriculture" },
  heroImage: { type: mediaSchema, required: true },
  bodyMedia: { type: mediaSchema, default: undefined },
  // Retained temporarily so existing articles can be read during migration.
  media: { type: [mediaSchema], default: undefined },
  status: { type: String, enum: ["draft", "published"], default: "published", index: true },
  publishedAt: Date,
}, { timestamps: true });

postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ status: 1, category: 1, publishedAt: -1 });
export default model("AgriLearnPost", postSchema);
