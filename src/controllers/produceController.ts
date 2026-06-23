import { Request, Response } from "express";
import Produce from "../models/produceModel.js";

export const getAllProduce = async (req: Request, res: Response) => {
  try {
    const { isFeatured } = req.query;

    const filter: any = {};

    // only apply filter if it was sent
    if (typeof isFeatured === "string") {
      filter.isFeatured = isFeatured === "true";
    }

    const produceList = await Produce.find(filter).sort({ createdAt: -1 });

    // Calculate percentage remaining for each produce and add it to the response
    const produceWithPercentage = produceList.map((produce) => {
      const remainingPercentage =
        (produce.remainingUnit / produce.totalUnit) * 100;

      return {
        ...produce.toObject(),
        remainingPercentage: Math.round(remainingPercentage * 10) / 10, // Round to 1 decimal place
        // Or use toFixed(1) if you want string: remainingPercentage.toFixed(1)
      };
    });

    return res.status(200).json({
      success: true,
      count: produceWithPercentage.length,
      produce: produceWithPercentage,
    });
  } catch (error: any) {
    console.error("Error fetching produce:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const fetchSingleProduce = async (
  req: Request<{ produceId: string }>,
  res: Response,
) => {
  try {
    const { produceId } = req.params;
    const produceItem = await Produce.findById(produceId);

    if (!produceItem) {
      return res.status(404).json({
        message: "Produce item not found",
      });
    }
    return res.status(200).json({
      produce: produceItem,
    });
  } catch (error: any) {
    console.error("Error fetching single produce item:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};
