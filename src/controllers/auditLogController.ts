// controllers/auditLogController.ts
import { Request, Response } from "express";
import AuditLog from "../models/auditLogModel.js";

interface AuditLogQuery {
  page?: string;
  limit?: string;
  startDate?: string;
  endDate?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  search?: string;
}

export const getAuditLogs = async (
  req: Request<{}, {}, {}, AuditLogQuery>,
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
      page = "1",
      limit = "20",
      startDate,
      endDate,
      action,
      entityType,
      userId,
      search,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter
    const filter: any = {};

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    if (action) {
      filter.action = action;
    }

    if (entityType) {
      filter.entityType = entityType;
    }

    if (userId) {
      filter.userId = userId;
    }

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { entityId: { $regex: search, $options: "i" } },
        { details: { $regex: search, $options: "i" } },
      ];
    }

    const [logs, totalCount] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        logs,
        totalCount,
        page: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
      },
    });
  } catch (error: any) {
    console.error("Error fetching audit logs:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getAuditLogStats = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Admin credentials required.",
      });
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      totalLogs,
      todayLogs,
      weekLogs,
      monthLogs,
      yearLogs,
      actionStats,
      entityStats,
    ] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ timestamp: { $gte: startOfToday } }),
      AuditLog.countDocuments({ timestamp: { $gte: startOfWeek } }),
      AuditLog.countDocuments({ timestamp: { $gte: startOfMonth } }),
      AuditLog.countDocuments({ timestamp: { $gte: startOfYear } }),
      AuditLog.aggregate([
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $group: { _id: "$entityType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalLogs,
        todayLogs,
        weekLogs,
        monthLogs,
        yearLogs,
        actionStats,
        entityStats,
      },
    });
  } catch (error: any) {
    console.error("Error fetching audit log stats:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const exportAuditLogs = async (
  req: Request<{}, {}, {}, AuditLogQuery>,
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

    const { startDate, endDate, action, entityType, userId, search } =
      req.query;

    const filter: any = {};

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (userId) filter.userId = userId;

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { entityId: { $regex: search, $options: "i" } },
      ];
    }

    const logs = await AuditLog.find(filter).sort({ timestamp: -1 }).lean();

    // Convert to CSV
    const csvHeaders = [
      "ID",
      "Timestamp",
      "Action",
      "Entity Type",
      "Entity ID",
      "User ID",
      "User Name",
      "User Email",
      "User Role",
      "Changes",
      "IP Address",
      "User Agent",
      "Details",
    ];

    const csvRows = logs.map((log) => [
      log._id,
      new Date(log.timestamp).toISOString(),
      log.action,
      log.entityType,
      log.entityId,
      log.userId,
      log.userName,
      log.userEmail,
      log.userRole,
      JSON.stringify(log.changes),
      log.ipAddress || "",
      log.userAgent || "",
      log.details || "",
    ]);

    const csv = [
      csvHeaders.join(","),
      ...csvRows.map((row) =>
        row
          .map((cell) => {
            const stringCell = String(cell);
            // Escape quotes and wrap in quotes if contains comma or newline
            if (
              stringCell.includes(",") ||
              stringCell.includes("\n") ||
              stringCell.includes('"')
            ) {
              return `"${stringCell.replace(/"/g, '""')}"`;
            }
            return stringCell;
          })
          .join(","),
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=audit-logs-${new Date().toISOString().split("T")[0]}.csv`,
    );

    // Add return here
    return res.send(csv);
  } catch (error: any) {
    console.error("Error exporting audit logs:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
