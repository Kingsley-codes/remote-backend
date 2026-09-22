import { productionStages } from "../utils/productionStages.js";
import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";
const trackSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    startMonth: { type: Number, required: true, min: 1, max: 12 },
    endMonth: { type: Number, required: true, min: 1, max: 12 },
    stage: { type: String, enum: productionStages, required: true },
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active',
      required: true,
    },
  },
  { _id: true },
);

const produceSchema = new Schema(
  {
    produceName: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    produceID: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    totalUnit: {
      type: Number,
      required: true,
    },
    minimumUnit: {
      type: Number,
      required: true,
    },
    stage: {
      type: String,
      enum: [...productionStages, "accepting-investments"],
      default: "preparation",
    },
    status: {
      type: String,
      enum: ["active", "closed", "suspended", "sold out"],
      default: "active",
    },
    remainingUnit: {
      type: Number,
      required: true,
      default: function () {
        return this.totalUnit;
      },
    },
    image1: {
      publicId: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
    },
    image2: {
      publicId: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
    },
    image3: {
      publicId: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
    },
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      enum: ["crops", "livestock", "aquaculture"],
      required: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    duration: {
      type: Number,
      required: true,
    },
    profit: { type: Number, required: true, min: 0 },
    rolloverProfit: { type: Number, required: true, min: 0 },
    tracks: {
      type: [trackSchema],
      required: true,
      validate: {
        validator: (tracks: unknown[]) => Array.isArray(tracks) && tracks.length > 0,
        message: "At least one track is required",
      },
    },
  },
  { timestamps: true },
);

export type Produce = InferSchemaType<typeof produceSchema>;
export type ProduceDocument = HydratedDocument<Produce>;

const Produce = model("Produce", produceSchema);
export default Produce;
