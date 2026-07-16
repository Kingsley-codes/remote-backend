import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import User from "./models/userModel.js";
import Admin from "./models/adminModel.js";
import Ticket from "./models/ticketModel.js";

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
      if (!token) return next(new Error("Unauthorized"));
      const decoded = jwt.verify(decodeURIComponent(token), process.env.JWT_SECRET!) as { id: string };
      const owner = adminToken ? await Admin.exists({ _id: decoded.id }) : await User.exists({ _id: decoded.id });
      if (!owner) return next(new Error("Unauthorized"));
      socket.data.identity = { id: decoded.id, type: adminToken ? "admin" : "user" };
      next();
    } catch { next(new Error("Unauthorized")); }
  });
  io.on("connection", (socket) => {
    socket.on("ticket:join", async (ticketId: string, acknowledge?: (ok: boolean) => void) => {
      const identity = socket.data.identity as { id: string; type: "user" | "admin" };
      const ticket = await Ticket.exists(identity.type === "admin" ? { _id: ticketId } : { _id: ticketId, user: identity.id });
      if (ticket) socket.join(`ticket:${ticketId}`);
      acknowledge?.(Boolean(ticket));
    });
    socket.on("ticket:leave", (ticketId: string) => socket.leave(`ticket:${ticketId}`));
  });
  return io;
}

export function emitTicketUpdate(ticketId: string, event: "ticket:message" | "ticket:status", ticket: unknown) {
  io?.to(`ticket:${ticketId}`).emit(event, ticket);
}
