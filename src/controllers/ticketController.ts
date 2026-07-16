import { Request, Response } from "express";
import { Types } from "mongoose";
import Ticket from "../models/ticketModel.js";
import { uploadToCloudinary } from "../middleware/uploadMiddleware.js";
import { emitTicketUpdate } from "../realtime.js";
import { sendPush } from "../services/pushService.js";

const DAY = 24 * 60 * 60 * 1000;

export async function closeExpiredResolvedTickets() {
  const cutoff = new Date(Date.now() - 3 * DAY);
  await Ticket.updateMany(
    { status: "resolved", resolvedAt: { $lte: cutoff } },
    [{ $set: { status: "closed", closedAt: { $ifNull: ["$closedAt", "$$NOW"] } } }],
  );
}

async function nextTicketNumber() {
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `TK-${suffix}`;
}

function files(req: Request) {
  const map = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  return map?.images ?? [];
}

async function attachments(req: Request) {
  return Promise.all(
    files(req).map(async (file) => {
      const result = await uploadToCloudinary(file.buffer, "remote-agric/tickets");
      return { url: result.secure_url, publicId: result.public_id };
    }),
  );
}

function fail(res: Response, error: unknown) {
  console.error("Ticket error:", error);
  return res.status(500).json({ status: "error", message: "Unable to process ticket request" });
}

export const createTicket = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { subject, category, priority, message } = req.body;
    if (!subject?.trim() || !message?.trim())
      return res.status(400).json({ status: "fail", message: "Subject and message are required" });
    const uploaded = await attachments(req);
    let ticketNumber = await nextTicketNumber();
    while (await Ticket.exists({ ticketNumber })) ticketNumber = await nextTicketNumber();
    const ticket = await Ticket.create({
      ticketNumber, user, subject, category, priority,
      messages: [{ senderType: "user", sender: user, body: message, attachments: uploaded }],
    });
    void sendPush({ ownerType: "admin" }, {
      title: `New support ticket #${ticket.ticketNumber}`,
      body: ticket.subject,
      url: `/admin/dashboard/support/${ticket.id}`,
      tag: `ticket-${ticket.id}`,
    }).catch(console.error);
    return res.status(201).json({ status: "success", data: { ticket } });
  } catch (error) { return fail(res, error); }
};

export const getUserTickets = async (req: Request, res: Response) => {
  try {
    await closeExpiredResolvedTickets();
    const tickets = await Ticket.find({ user: req.user }).sort({ lastMessageAt: -1 }).select("-messages");
    return res.json({ status: "success", data: { tickets } });
  } catch (error) { return fail(res, error); }
};

export const getUserTicket = async (req: Request, res: Response) => {
  try {
    await closeExpiredResolvedTickets();
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, user: req.user });
    if (!ticket) return res.status(404).json({ status: "fail", message: "Ticket not found" });
    return res.json({ status: "success", data: { ticket } });
  } catch (error) { return fail(res, error); }
};

export const addUserMessage = async (req: Request, res: Response) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, user: req.user });
    if (!ticket) return res.status(404).json({ status: "fail", message: "Ticket not found" });
    if (ticket.status !== "open") return res.status(409).json({ status: "fail", message: "Only open tickets accept new messages" });
    const uploaded = await attachments(req);
    if (!req.body.message?.trim() && !uploaded.length)
      return res.status(400).json({ status: "fail", message: "Add a message or image" });
    ticket.messages.push({ senderType: "user", sender: req.user!, body: req.body.message ?? "", attachments: uploaded } as never);
    ticket.lastMessageAt = new Date();
    await ticket.save();
    emitTicketUpdate(ticket.id, "ticket:message", ticket);
    void sendPush({ ownerType: "admin" }, {
      title: `New message on #${ticket.ticketNumber}`,
      body: req.body.message?.trim() || "A customer sent an image",
      url: `/admin/dashboard/support/${ticket.id}`,
      tag: `ticket-${ticket.id}`,
    }).catch(console.error);
    return res.status(201).json({ status: "success", data: { ticket } });
  } catch (error) { return fail(res, error); }
};

export const getAdminTickets = async (req: Request, res: Response) => {
  try {
    await closeExpiredResolvedTickets();
    const status = typeof req.query.status === "string" ? req.query.status : "open";
    const filter = status === "all" ? {} : { status };
    const tickets = await Ticket.find(filter).sort({ lastMessageAt: -1 }).populate("user", "firstName lastName email profilePhoto").select("-messages");
    return res.json({ status: "success", data: { tickets } });
  } catch (error) { return fail(res, error); }
};

export const getAdminTicket = async (req: Request, res: Response) => {
  try {
    await closeExpiredResolvedTickets();
    const ticket = await Ticket.findById(req.params.ticketId).populate("user", "firstName lastName email phone profilePhoto");
    if (!ticket) return res.status(404).json({ status: "fail", message: "Ticket not found" });
    return res.json({ status: "success", data: { ticket } });
  } catch (error) { return fail(res, error); }
};

export const addAdminMessage = async (req: Request, res: Response) => {
  try {
    const ticket = await Ticket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ status: "fail", message: "Ticket not found" });
    if (ticket.status !== "open") return res.status(409).json({ status: "fail", message: "Reopen this ticket before replying" });
    const uploaded = await attachments(req);
    if (!req.body.message?.trim() && !uploaded.length)
      return res.status(400).json({ status: "fail", message: "Add a message or image" });
    ticket.messages.push({ senderType: "admin", sender: req.admin!, body: req.body.message ?? "", attachments: uploaded } as never);
    ticket.lastMessageAt = new Date();
    await ticket.save();
    emitTicketUpdate(ticket.id, "ticket:message", ticket);
    void sendPush({ ownerType: "user", owner: ticket.user.toString() }, {
      title: `Support replied to #${ticket.ticketNumber}`,
      body: req.body.message?.trim() || "Support sent an image",
      url: `/dashboard/support/${ticket.id}`,
      tag: `ticket-${ticket.id}`,
    }).catch(console.error);
    return res.status(201).json({ status: "success", data: { ticket } });
  } catch (error) { return fail(res, error); }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const ticket = await Ticket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ status: "fail", message: "Ticket not found" });
    const status = req.body.status;
    if (!["open", "resolved"].includes(status))
      return res.status(400).json({ status: "fail", message: "Status must be open or resolved" });
    if (ticket.status === "closed")
      return res.status(409).json({ status: "fail", message: "Closed tickets cannot be reopened" });
    ticket.status = status;
    if (status === "resolved") {
      ticket.resolvedAt = new Date();
      ticket.expiresAt = new Date(Date.now() + 30 * DAY);
    } else {
      ticket.resolvedAt = null;
      ticket.expiresAt = null;
    }
    await ticket.save();
    emitTicketUpdate(ticket.id, "ticket:status", ticket);
    void sendPush({ ownerType: "user", owner: ticket.user.toString() }, {
      title: `Ticket #${ticket.ticketNumber} ${status === "resolved" ? "resolved" : "reopened"}`,
      body: status === "resolved" ? "Your support request has been marked resolved." : "Your support request has been reopened.",
      url: `/dashboard/support/${ticket.id}`,
      tag: `ticket-${ticket.id}`,
    }).catch(console.error);
    return res.json({ status: "success", data: { ticket } });
  } catch (error) { return fail(res, error); }
};
