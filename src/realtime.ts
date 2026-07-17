import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import User from "./models/userModel.js";
import Admin from "./models/adminModel.js";
import Ticket from "./models/ticketModel.js";
import Produce from "./models/produceModel.js";

let io: Server | undefined;
const cookieValue = (header: string | undefined, name: string) =>
  header?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.[1];

export function initializeRealtime(server: HttpServer, origins: string[]) {
  io = new Server(server, { cors: { origin: origins, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const userToken = cookieValue(socket.handshake.headers.cookie, "user_token");
      const adminToken = cookieValue(socket.handshake.headers.cookie, "admin_token");
      const token = adminToken ?? userToken;
      if (!token) {
        socket.data.identity = null;
        return next();
      }
      const decoded = jwt.verify(decodeURIComponent(token), process.env.JWT_SECRET!) as { id: string };
      const owner = adminToken ? await Admin.exists({ _id: decoded.id }) : await User.exists({ _id: decoded.id });
      if (!owner) return next(new Error("Unauthorized"));
      socket.data.identity = { id: decoded.id, type: adminToken ? "admin" : "user" };
      next();
    } catch {
      // Forum rooms are public to read, so an expired cookie becomes an
      // anonymous socket. Protected ticket events still verify identity.
      socket.data.identity = null;
      next();
    }
  });
  io.on("connection", (socket) => {
    socket.on("ticket:join", async (ticketId: string, acknowledge?: (ok: boolean) => void) => {
      const identity = socket.data.identity as { id: string; type: "user" | "admin" } | null;
      if (!identity) return acknowledge?.(false);
      const ticket = await Ticket.exists(identity.type === "admin" ? { _id: ticketId } : { _id: ticketId, user: identity.id });
      if (ticket) socket.join(`ticket:${ticketId}`);
      acknowledge?.(Boolean(ticket));
    });
    socket.on("ticket:leave", (ticketId: string) => socket.leave(`ticket:${ticketId}`));
    socket.on("forum:join", async (roomId: string, acknowledge?: (ok: boolean) => void) => {
      const valid = roomId === "general" || Boolean(await Produce.exists({ _id: roomId, status: "active" }));
      if (valid) socket.join(`forum:${roomId}`);
      acknowledge?.(valid);
    });
    socket.on("forum:leave", (roomId: string) => socket.leave(`forum:${roomId}`));
  });
  return io;
}

export function emitTicketUpdate(ticketId: string, event: "ticket:message" | "ticket:status", ticket: unknown) {
  io?.to(`ticket:${ticketId}`).emit(event, ticket);
}

export function emitForumMessage(roomId: string, message: unknown) {
  io?.to(`forum:${roomId}`).emit("forum:message", message);
}
