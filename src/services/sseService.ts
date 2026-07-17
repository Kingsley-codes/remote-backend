import type { Response } from "express";

const clients = new Map<string, Set<Response>>();

export function addSseClient(userId: string, res: Response) {
  const set = clients.get(userId) ?? new Set<Response>();
  set.add(res);
  clients.set(userId, set);
  return () => {
    set.delete(res);
    if (!set.size) clients.delete(userId);
  };
}

export function sendUserEvent(userId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.get(userId)?.forEach((response) => response.write(payload));
}

export function sendUsersEvent(userIds: string[], event: string, data: unknown) {
  new Set(userIds).forEach((id) => sendUserEvent(id, event, data));
}
