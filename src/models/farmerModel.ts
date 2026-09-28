import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const farmerSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  town: {
    type: String,
    required: true,
  },
  lga: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  state: {
    type: String,
    required: true,
  },
  farmSize: {
    // Numeric acreage; retained as a string for compatibility with existing records.
    type: String,
    required: true,
  },
  fundingAmount: {
    type: String,
    required: true,
  },
  amountFunded: {
    type: Number,
    min: 0,
  },
  cropsGrown: {
    type: [String],
    required: true,
  },
  fundingStatus: {
    type: String,
    enum: ["pending", "partially funded", "fully funded", "rejected"],
    default: "pending",
  },
  profilePhoto: {
    publicId: { type: String },
    url: { type: String },
  },
  expectedYield: {
    type: String,
    required: true,
  },
  yieldRecieved: {
    type: Boolean,
    default: false,
  },
  farmerID: {
    type: String,
    required: true,
    unique: true,
  },
}, { timestamps: true });

export type Farmer = InferSchemaType<typeof farmerSchema>;
export type FarmerDocument = HydratedDocument<Farmer>;

const Farmer = model<FarmerDocument>("Farmer", farmerSchema);

export default Farmer;
