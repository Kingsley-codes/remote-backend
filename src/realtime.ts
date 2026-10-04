import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import User from "./models/userModel.js";
import Admin from "./models/adminModel.js";
import Ticket from "./models/ticketModel.js";
import { forumAccess } from "./services/forumAccessService.js";
import { verifyIdentityToken } from "./services/tokenService.js";

let io: Server | undefined;
const cookieValue = (header: string | undefined, name: string) =>
  header?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.[1];

export function initializeRealtime(server: HttpServer, origins: string[]) {
  io = new Server(server, { cors: { origin: origins, credentials: true } });
  io.use(async (socket, next) => {
    // Match HTTP identity selection: an expired admin cookie must not hide a
    // valid user session (and that user's community restrictions).
    for (const type of ["admin", "user"] as const) {
      try {
        const token = cookieValue(socket.handshake.headers.cookie, `${type}_token`);
        if (!token) continue;
        const decoded = verifyIdentityToken(decodeURIComponent(token), type);
        const owner = type === "admin"
          ? await Admin.findOne({ _id: decoded.id, status: "active", sessionVersion: decoded.sv }).select("_id")
          : await User.findOne({ _id: decoded.id, status: "active", sessionVersion: decoded.sv }).select("_id");
        if (!owner) continue;
        socket.data.identity = { id: decoded.id, type };
        return next();
      } catch { /* Try the other account type before treating this as a guest. */ }
    }
    socket.data.identity = null;
    next();
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
      try {
        if (typeof roomId !== "string") return acknowledge?.(false);
        const identity = socket.data.identity as { id: string; type: "user" | "admin" } | null;
        const access = await forumAccess(identity?.type === "user" ? identity.id : null, identity?.type === "admin" ? identity.id : null, roomId);
        socket.data.forumRoom = roomId;
        if (access.canRead) await socket.join(`forum:${roomId}`);
        acknowledge?.(access.canRead);
      } catch { acknowledge?.(false); }
    });
    socket.on("forum:leave", (roomId: string) => { socket.leave(`forum:${roomId}`); if (socket.data.forumRoom === roomId) socket.data.forumRoom = null; });
  });
  return io;
}

export function emitTicketUpdate(ticketId: string, event: "ticket:message" | "ticket:status", ticket: unknown) {
  io?.to(`ticket:${ticketId}`).emit(event, ticket);
}

export function emitForumMessage(roomId: string, message: unknown) {
  io?.to(`forum:${roomId}`).emit("forum:message", message);
}

export function emitForumChange(roomId: string, change: { deletedId: string }) {
  io?.to(`forum:${roomId}`).emit("forum:changed", change);
}

export async function refreshForumAccess(roomId: string) {
  if (!io) return;
  const sockets = await io.fetchSockets();
  await Promise.all(sockets.filter((socket) => socket.data.forumRoom === roomId || socket.rooms.has(`forum:${roomId}`)).map(async (socket) => {
    const identity = socket.data.identity as { id: string; type: "user" | "admin" } | null;
    const access = await forumAccess(identity?.type === "user" ? identity.id : null, identity?.type === "admin" ? identity.id : null, roomId);
    if (access.canRead) socket.join(`forum:${roomId}`);
    else socket.leave(`forum:${roomId}`);
    socket.emit("forum:access", { room: roomId });
  }));
}
