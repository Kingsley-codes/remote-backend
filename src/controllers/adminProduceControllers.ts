import { stagesByCategory, normalizeStage, type FarmCategory } from "../utils/productionStages.js";
import { parseTracks, validateTracks } from "../utils/investmentTracks.js";
import { Request, Response } from "express";
import { logError } from "../utils/logger.js";
import Produce from "../models/produceModel.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../middleware/uploadMiddleware.js";
import { ProduceRequestBody } from "../interface/allInterfaces.js";
import Investment from "../models/investmentModel.js";
import { createProduceNotification } from "./notificationController.js";
import { sendProduceStageEmail } from "../services/emailService.js";

export const generateProduceID = () =>
  "RAP-" + Math.random().toString(36).substring(2, 10).toUpperCase();

export const createProduce = async (
  req: Request<{}, {}, ProduceRequestBody>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const {
      produceName,
      isFeatured,
      title,
      totalUnit,
      duration,
      minimumUnit,
      description,
      price,
      category,
      profit,
      rolloverProfit,
      tracks,
    } = req.body;

    if (
      !produceName ||
      !title ||
      !totalUnit ||
      !duration ||
      !minimumUnit ||
      profit === undefined ||
      rolloverProfit === undefined ||
      !tracks ||
      !description ||
      !price ||
      !category
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    let validatedTracks;
    try {
      validatedTracks = validateTracks(
        parseTracks(tracks),
        Number(duration),
        category as FarmCategory,
      );
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }
    if (
      !req.files ||
      Array.isArray(req.files) ||
      !req.files?.image1?.[0] ||
      !req.files?.image2?.[0] ||
      !req.files?.image3?.[0]
    ) {
      return res.status(400).json({
        error: "All images are required",
      });
    }

    const uploadResult1 = await uploadToCloudinary(
      req.files.image1[0],
      "AgroFund Hub/produce_images",
    );

    const uploadResult2 = await uploadToCloudinary(
      req.files.image2[0],
      "AgroFund Hub/produce_images",
    );

    const uploadResult3 = await uploadToCloudinary(
      req.files.image3[0],
      "AgroFund Hub/produce_images",
    );

    const newProduce = await Produce.create({
      produceName,
      title,
      totalUnit,
      minimumUnit,
      description,
      price,
      isFeatured,
      duration,
      profit,
      rolloverProfit,
      tracks: validatedTracks,
      produceID: generateProduceID(),
      category,
      stage: category === "aquaculture" ? "pond-preparation" : "preparation",
      image1: {
        publicId: uploadResult1.public_id,
        url: uploadResult1.secure_url,
      },
      image2: {
        publicId: uploadResult2.public_id,
        url: uploadResult2.secure_url,
      },
      image3: {
        publicId: uploadResult3.public_id,
        url: uploadResult3.secure_url,
      },
    });

    return res.status(201).json({
      status: "success",
      message: "Produce created successfully",
      produce: newProduce,
    });
  } catch (error: any) {
    logError("admin.produce_create_failed", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

export const deleteProduce = async (
  req: Request<{ produceId: string }>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { produceId } = req.params;

    const produce = await Produce.findById(produceId);
    if (!produce) {
      return res.status(404).json({
        message: "Produce not found",
      });
    }

    // Delete images from Cloudinary
    if (produce.image1?.publicId) {
      await deleteFromCloudinary(produce.image1.publicId);
    }

    if (produce.image2?.publicId) {
      await deleteFromCloudinary(produce.image2.publicId);
    }

    if (produce.image3?.publicId) {
      await deleteFromCloudinary(produce.image3.publicId);
    }

    // Find and delete in one query, but get the document back
    const deletedProduce = await Produce.findOneAndDelete({ _id: produceId });
    if (!deletedProduce) {
      return res.status(404).json({
        message: "Produce not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Produce deleted successfully",
      deletedProduce,
    });
  } catch (error: any) {
    logError("admin.produce_delete_failed", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

export const editProduce = async (
  req: Request<{ produceId?: string }, {}, ProduceRequestBody>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const {
      produceId: bodyProduceId,
      produceName,
      title,
      totalUnit,
      minimumUnit,
      duration,
      profit,
      rolloverProfit,
      isFeatured,
      description,
      price,
      category,
    } = req.body;
    const produceId = req.params.produceId ?? bodyProduceId;

    if (Array.isArray(req.files)) {
      return res.status(400).json({
        message: "Invalid file upload format",
      });
    }

    const files = req.files ?? {};
    const image1file = files.image1?.[0];
    const image2file = files.image2?.[0];
    const image3file = files.image3?.[0];

    const existingProduce = title
      ? await Produce.findOne({ title, _id: { $ne: produceId } })
      : null;
    if (existingProduce) {
      return res.status(400).json({
        message: "Produce with this title already exists",
      });
    }

    if (!produceId) {
      return res.status(400).json({
        message: "Produce ID is required",
      });
    }

    const updatedProduce = await Produce.findById(produceId);

    if (!updatedProduce) {
      return res.status(404).json({
        message: "Produce not found",
      });
    }

    const numericFields = {
      totalUnit: totalUnit === undefined ? updatedProduce.totalUnit : Number(totalUnit),
      minimumUnit: minimumUnit === undefined ? updatedProduce.minimumUnit : Number(minimumUnit),
      duration: duration === undefined ? updatedProduce.duration : Number(duration),
      price: price === undefined ? updatedProduce.price : Number(price),
      profit: profit === undefined ? updatedProduce.profit : Number(profit),
      rolloverProfit: rolloverProfit === undefined ? updatedProduce.rolloverProfit : Number(rolloverProfit),
    };
    if (
      !Number.isSafeInteger(numericFields.totalUnit) || numericFields.totalUnit < 1 ||
      !Number.isSafeInteger(numericFields.minimumUnit) || numericFields.minimumUnit < 1 ||
      !Number.isSafeInteger(numericFields.duration) || numericFields.duration < 1 || numericFields.duration > 12 ||
      !Number.isFinite(numericFields.price) || numericFields.price <= 0 ||
      !Number.isFinite(numericFields.profit) || numericFields.profit < 0 ||
      !Number.isFinite(numericFields.rolloverProfit) || numericFields.rolloverProfit < 0
    ) {
      return res.status(400).json({ message: 'Produce values are invalid' });
    }
    const soldUnits = updatedProduce.totalUnit - updatedProduce.remainingUnit;
    if (numericFields.totalUnit < soldUnits) {
      return res.status(409).json({ message: 'Total units cannot be lower than units already sold' });
    }
    if (numericFields.minimumUnit > numericFields.totalUnit - soldUnits) {
      return res.status(400).json({ message: 'Minimum units cannot exceed the remaining units' });
    }
    try {
      validateTracks(
        updatedProduce.tracks.map((track) => ({
          name: track.name,
          startMonth: track.startMonth,
          endMonth: track.endMonth,
          stage: track.stage,
          status: track.status,
        })),
        numericFields.duration,
        (category ?? updatedProduce.category) as FarmCategory,
      );
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }

    if (produceName) updatedProduce.produceName = produceName;
    if (title) updatedProduce.title = title;
    updatedProduce.remainingUnit = numericFields.totalUnit - soldUnits;
    updatedProduce.totalUnit = numericFields.totalUnit;
    updatedProduce.minimumUnit = numericFields.minimumUnit;
    updatedProduce.duration = numericFields.duration;
    updatedProduce.price = numericFields.price;
    updatedProduce.profit = numericFields.profit;
    updatedProduce.rolloverProfit = numericFields.rolloverProfit;
    if (isFeatured !== undefined) {
      updatedProduce.isFeatured = isFeatured === true || String(isFeatured) === 'true';
    }
    if (description) updatedProduce.description = description;
    if (category && category !== updatedProduce.category) {
      if (await Investment.exists({ produce: produceId })) {
        return res.status(409).json({ message: "Category cannot change after investments have been created" });
      }
      updatedProduce.category = category;
      for (const track of updatedProduce.tracks) {
        track.stage = normalizeStage(track.stage, category);
      }
      updatedProduce.stage = category === "aquaculture" ? "pond-preparation" : "preparation";
    }
    updatedProduce.stage = normalizeStage(updatedProduce.stage, updatedProduce.category);

    if (image1file) {
      if (updatedProduce.image1 && updatedProduce.image1.publicId) {
        await deleteFromCloudinary(updatedProduce.image1.publicId);
      }

      const uploadResult1 = await uploadToCloudinary(
        image1file,
        "AgroFund Hub/produce_images",
      );
      updatedProduce.image1 = {
        publicId: uploadResult1.public_id,
        url: uploadResult1.secure_url,
      };
    }

    if (image2file) {
      if (updatedProduce.image2 && updatedProduce.image2.publicId) {
        await deleteFromCloudinary(updatedProduce.image2.publicId);
      }

      const uploadResult2 = await uploadToCloudinary(
        image2file,
        "AgroFund Hub/produce_images",
      );
      updatedProduce.image2 = {
        publicId: uploadResult2.public_id,
        url: uploadResult2.secure_url,
      };
    }

    if (image3file) {
      if (updatedProduce.image3 && updatedProduce.image3.publicId) {
        await deleteFromCloudinary(updatedProduce.image3.publicId);
      }

      const uploadResult3 = await uploadToCloudinary(
        image3file,
        "AgroFund Hub/produce_images",
      );
      updatedProduce.image3 = {
        publicId: uploadResult3.public_id,
        url: uploadResult3.secure_url,
      };
    }

    await updatedProduce.save();

    return res.status(200).json({
      status: "success",
      message: "Produce updated successfully",
      produce: updatedProduce,
    });
  } catch (error: any) {
    logError("admin.produce_update_failed", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

export const getAllProduce = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const produceList = await Produce.find().sort({
      createdAt: -1,
    });

    return res.status(200).json({
      status: "success",
      produce: produceList.map((produce) => ({ ...produce.toObject(), stage: normalizeStage(produce.stage, produce.category) })),
    });
  } catch (error: any) {
    logError("admin.produce_list_failed", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

export const suspendProduce = async (
  req: Request<{ produceId: string }>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { produceId } = req.params;

    const produce = await Produce.findOne({
      _id: produceId,
    });
    if (!produce) {
      return res.status(404).json({
        message: "Produce not found",
      });
    }
    if (produce.status === "suspended") {
      return res.status(400).json({
        message: "Produce is already suspended",
      });
    }
    produce.status = "suspended";
    await produce.save();

    return res.status(200).json({
      status: "success",
      message: "Produce suspended successfully",
    });
  } catch (error: any) {
    logError("admin.produce_suspend_failed", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

export const activateProduce = async (
  req: Request<{ produceId: string }>,
  res: Response,
) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const { produceId } = req.params;
    const produce = await Produce.findOne({
      _id: produceId,
    });
    if (!produce) {
      return res.status(404).json({
        message: "Produce not found",
      });
    }
    if (produce.status === "active") {
      return res.status(400).json({
        message: "Produce is already active",
      });
    }
    produce.status = "active";

    await produce.save();
    return res.status(200).json({
      status: "success",
      message: "Produce activated successfully",
    });
  } catch (error: any) {
    logError("admin.produce_activate_failed", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

export const updateProduceStage = async (req: Request, res: Response) => {
  try {
    const produceID = String(req.params.produceID);
    const stage = String(req.body.stage ?? "");

    const updatedProduce = await Produce.findById(produceID);
    if (!updatedProduce) return res.status(404).json({ success: false, message: "Produce not found" });
    const validStages: readonly string[] = stagesByCategory[updatedProduce.category as FarmCategory];
    if (!validStages?.includes(stage)) {
      return res.status(400).json({ success: false, message: "Invalid stage for this category" });
    }
    updatedProduce.stage = normalizeStage(stage, updatedProduce.category);
    await updatedProduce.save();

    await Investment.updateMany(
      { produce: produceID, status: "ongoing" },
      { stage },
    );
    const stageLabel = stage
      .split("-")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    await createProduceNotification({
      produceId: produceID,
      title: `${updatedProduce.produceName} stage updated`,
      message: `Your remote farm has moved to ${stageLabel}.`,
      type: "stage-change",
      adminId: req.admin,
    });
    const investments = await Investment.find({
      produce: produceID,
      status: "ongoing",
      orderStatus: "confirmed",
    })
      .populate("user", "firstName email")
      .select("user")
      .lean();
    const recipients = new Map<string, { firstName: string; email: string }>();
    for (const investment of investments) {
      const user = investment.user as unknown as {
        _id?: { toString(): string };
        firstName?: string;
        email?: string;
      } | null;
      if (user?._id && user.email) {
        recipients.set(user._id.toString(), {
          firstName: user.firstName || "Investor",
          email: user.email,
        });
      }
    }
    await Promise.all(
      [...recipients.values()].map((user) =>
        sendProduceStageEmail(user.email, user.firstName, updatedProduce.title, stageLabel),
      ),
    );

    return res.status(200).json({
      success: true,
      message: "Produce stage updated successfully",
      data: {
        produce: updatedProduce,
        stage,
      },
    });
  } catch (error: any) {
    logError("admin.produce_stage_update_failed", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateTrackStage = async (req: Request, res: Response) => {
  try {
    const produceID = String(req.params.produceID);
    const trackID = String(req.params.trackID);
    const stage = String(req.body.stage ?? "");
    const produce = await Produce.findById(produceID);
    if (!produce) return res.status(404).json({ success: false, message: "Produce not found" });

    const validStages: readonly string[] = stagesByCategory[produce.category as FarmCategory];
    if (!validStages?.includes(stage)) {
      return res.status(400).json({ success: false, message: "Invalid stage for this category" });
    }
    const track = produce.tracks.find((item) => String(item._id) === trackID);
    if (!track) return res.status(404).json({ success: false, message: "Track not found" });

    track.stage = normalizeStage(stage, produce.category);
    await produce.save();
    await Investment.updateMany(
      { produce: produceID, "track.id": trackID, status: "ongoing" },
      { stage: track.stage },
    );

    const label = stage.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    await createProduceNotification({
      produceId: produceID,
      trackId: trackID,
      title: `${produce.produceName} · ${track.name} updated`,
      message: `Your ${track.name} farm has moved to ${label}.`,
      type: "stage-change",
      adminId: req.admin,
    });

    const investments = await Investment.find({
      produce: produceID,
      "track.id": trackID,
      status: "ongoing",
      orderStatus: "confirmed",
    }).populate("user", "firstName email").select("user").lean();
    const recipients = new Map<string, { firstName: string; email: string }>();
    for (const investment of investments) {
      const user = investment.user as unknown as { _id?: { toString(): string }; firstName?: string; email?: string } | null;
      if (user?._id && user.email) recipients.set(user._id.toString(), { firstName: user.firstName || "Investor", email: user.email });
    }
    await Promise.all([...recipients.values()].map((user) =>
      sendProduceStageEmail(user.email, user.firstName, `${produce.title} (${track.name})`, label),
    ));
    return res.json({ success: true, message: "Track stage updated successfully", data: { track } });
  } catch (error) {
    logError("admin.track_stage_update_failed", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateTrackStatus = async (req: Request, res: Response) => {
  try {
    const produceID = String(req.params.produceID);
    const trackID = String(req.params.trackID);
    const status = String(req.body.status ?? '');
    if (status !== 'active' && status !== 'closed') {
      return res.status(400).json({ success: false, message: 'Status must be active or closed' });
    }

    const produce = await Produce.findById(produceID);
    if (!produce) {
      return res.status(404).json({ success: false, message: 'Produce not found' });
    }
    const track = produce.tracks.find((item) => String(item._id) === trackID);
    if (!track) {
      return res.status(404).json({ success: false, message: 'Track not found' });
    }

    track.status = status;
    await produce.save();
    return res.json({
      success: true,
      message: status === 'closed' ? 'Track closed to new investments' : 'Track opened for investment',
      data: { track },
    });
  } catch (error) {
    logError('admin.track_status_update_failed', error);
    return res.status(500).json({ success: false, message: 'Unable to update track status' });
  }
};

export const addProduceTrack = async (req: Request, res: Response) => {
  try {
    const produceID = String(req.params.produceID);
    const produce = await Produce.findById(produceID);
    if (!produce) {
      return res.status(404).json({ success: false, message: "Produce not found" });
    }

    let newTrack;
    try {
      [newTrack] = validateTracks(
        [{
          name: typeof req.body.name === "string" ? req.body.name : undefined,
          startMonth: Number(req.body.startMonth),
          endMonth: Number(req.body.endMonth),
          stage: "preparation",
        }],
        produce.duration,
        produce.category as FarmCategory,
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Invalid track",
      });
    }

    if (!newTrack) {
      return res.status(400).json({ success: false, message: "Invalid track" });
    }
    const duplicate = produce.tracks.some(
      (track) =>
        track.startMonth === newTrack.startMonth &&
        track.endMonth === newTrack.endMonth,
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "A track with this start and end month already exists",
      });
    }
    produce.tracks.push(newTrack);
    await produce.save();
    const savedTrack = produce.tracks[produce.tracks.length - 1];

    return res.status(201).json({
      success: true,
      message: "Track added successfully",
      data: { track: savedTrack, produce },
    });
  } catch (error) {
    logError("admin.track_create_failed", error);
    return res.status(error instanceof Error && error.name === "ValidationError" ? 400 : 500).json({
      success: false,
      message: error instanceof Error && error.name === "ValidationError"
        ? error.message
        : "Unable to add track",
    });
  }
};

export const deleteProduceTrack = async (req: Request, res: Response) => {
  try {
    const produceID = String(req.params.produceID);
    const trackID = String(req.params.trackID);
    const produce = await Produce.findById(produceID);
    if (!produce) {
      return res.status(404).json({ success: false, message: "Produce not found" });
    }
    if (produce.tracks.length === 1) {
      return res.status(409).json({ success: false, message: "A produce must have at least one track" });
    }
    const trackIndex = produce.tracks.findIndex((track) => String(track._id) === trackID);
    if (trackIndex < 0) {
      return res.status(404).json({ success: false, message: "Track not found" });
    }
    if (await Investment.exists({ produce: produceID, "track.id": trackID })) {
      return res.status(409).json({
        success: false,
        message: "This track cannot be deleted because it already has investments",
      });
    }

    produce.tracks.splice(trackIndex, 1);
    await produce.save();
    return res.json({
      success: true,
      message: "Track deleted successfully",
      data: { produce },
    });
  } catch (error) {
    logError("admin.track_delete_failed", error);
    return res.status(500).json({ success: false, message: "Unable to delete track" });
  }
};
