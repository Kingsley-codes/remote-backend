import crypto from "node:crypto";
import type { Request, Response } from "express";

const stateCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60 * 1000,
});

export const issueOAuthState = (res: Response, cookieName: string) => {
  const state = crypto.randomBytes(32).toString("base64url");
  res.cookie(cookieName, state, stateCookieOptions());
  return state;
};

export const consumeOAuthState = (
  req: Request,
  res: Response,
  cookieName: string,
) => {
  const expected = req.cookies[cookieName];
  const received = typeof req.query.state === "string" ? req.query.state : "";
  res.clearCookie(cookieName, stateCookieOptions());
  if (!expected || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};
