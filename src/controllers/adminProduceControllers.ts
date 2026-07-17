import { Request, Response } from "express";
import Produce from "../models/produceModel.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../middleware/uploadMiddleware.js";
import { ProduceRequestBody } from "../interface/allInterfaces.js";
import Investment from "../models/investmentModel.js";
import { createProduceNotification } from "./notificationController.js";

export const generateProduceID = () =>
  "GRP-" + Math.random().toString(36).substring(2, 10).toUpperCase();

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
      ROI,
      description,
      price,
      category,
    } = req.body;

    if (
      !produceName ||
      !title ||
      !totalUnit ||
      !duration ||
      !minimumUnit ||
      !ROI ||
      !description ||
      !price ||
      !category
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
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
      req.files.image1[0].buffer,
      "AgroFund Hub/produce_images",
    );

    const uploadResult2 = await uploadToCloudinary(
      req.files.image2[0].buffer,
      "AgroFund Hub/produce_images",
    );

    const uploadResult3 = await uploadToCloudinary(
      req.files.image3[0].buffer,
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
      ROI,
      produceID: generateProduceID(),
      category,
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
    console.error("Error creating produce:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
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
    console.error("Error deleting produce:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
    });
  }
};

export const editProduce = async (
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
      produceId,
      produceName,
      title,
      totalUnit,
      description,
      price,
      category,
    } = req.body;

    if (!req.files || Array.isArray(req.files)) {
      return res.status(400).json({
        message: "Invalid file upload format",
      });
    }

    const image1file = req.files.image1?.[0];
    const image2file = req.files.image2?.[0];
    const image3file = req.files.image3?.[0];

    const existingProduce = await Produce.findOne({ title: title });
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

    if (produceName) updatedProduce.produceName = produceName;
    if (title) updatedProduce.title = title;
    if (totalUnit) updatedProduce.totalUnit = totalUnit;
    if (description) updatedProduce.description = description;
    if (price) updatedProduce.price = price;
    if (category) updatedProduce.category = category;

    if (image1file) {
      if (updatedProduce.image1 && updatedProduce.image1.publicId) {
        await deleteFromCloudinary(updatedProduce.image1.publicId);
      }

      const uploadResult1 = await uploadToCloudinary(
        image1file.buffer,
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
        image2file.buffer,
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
        image3file.buffer,
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
    console.error("Error editing produce:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
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
      produce: produceList,
    });
  } catch (error: any) {
    console.error("Error fetching produce:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
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
    console.error("Error suspending produce:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
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
    console.error("Error activating produce:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
    });
  }
};

export const updateProduceStage = async (req: Request, res: Response) => {
  try {
    const produceID = String(req.params.produceID);
    const stage = String(req.body.stage ?? "");

    const validStages = ["accepting-investments", "land-clearing", "planting", "growing", "harvesting", "returns-to-investment"];

    if (!validStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stage provided",
      });
    }

    // FIND PRODUCE
    const updatedProduce = await Produce.findByIdAndUpdate(
      produceID,
      { stage },
      { new: true },
    );

    if (!updatedProduce) {
      return res.status(404).json({
        success: false,
        message: "Produce not found",
      });
    }

    await Investment.updateMany({ produce: produceID, status: "ongoing" }, { stage });
    const stageLabel = stage.split("-").map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    await createProduceNotification({ produceId: produceID, title: `${updatedProduce.produceName} stage updated`, message: `Your investment has moved to ${stageLabel}.`, type: "stage-change", adminId: req.admin });

    return res.status(200).json({
      success: true,
      message: "Produce stage updated successfully",
      data: {
        produce: updatedProduce,
        stage,
      },
    });
  } catch (error: any) {
    console.error("Error updating produce stage:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
