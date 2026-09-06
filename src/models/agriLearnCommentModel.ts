import { InferSchemaType, Schema, model } from "mongoose";

const agriLearnCommentSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "AgriLearnPost",
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500,
    },
  },
  { timestamps: true },
);

agriLearnCommentSchema.index({ post: 1, createdAt: -1 });

export type AgriLearnComment = InferSchemaType<typeof agriLearnCommentSchema>;
export default model("AgriLearnComment", agriLearnCommentSchema);
