import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";

export type IdentityType = "user" | "admin";
export type IdentityToken = {
  id: string;
  type: IdentityType;
  sv: number;
};

const secretFor = (type: IdentityType) => {
  const configured = type === "admin"
    ? process.env.JWT_ADMIN_SECRET
    : process.env.JWT_USER_SECRET;
  const legacyRoot = process.env.JWT_SECRET;
  const secret = configured ?? (legacyRoot
    ? crypto.createHmac("sha256", legacyRoot).update(`remote-agric:${type}`).digest("hex")
    : undefined);
  if (!secret || secret.length < 32) {
    throw new Error(`JWT_${type.toUpperCase()}_SECRET must contain at least 32 characters`);
  }
  return secret;
};

const audienceFor = (type: IdentityType) =>
  type === "admin" ? "remote-agric-admin" : "remote-agric-user";

export const signIdentityToken = (
  id: string,
  type: IdentityType,
  sessionVersion: number,
) => {
  const expiresIn = process.env.JWT_EXPIRES_IN;
  if (!expiresIn) throw new Error("JWT_EXPIRES_IN is not defined");
  return jwt.sign({ id, type, sv: sessionVersion }, secretFor(type), {
    algorithm: "HS256",
    audience: audienceFor(type),
    issuer: "remote-agric-api",
    expiresIn: expiresIn as NonNullable<SignOptions["expiresIn"]>,
  });
};

export const verifyIdentityToken = (token: string, type: IdentityType) =>
  jwt.verify(token, secretFor(type), {
    algorithms: ["HS256"],
    audience: audienceFor(type),
    issuer: "remote-agric-api",
  }) as IdentityToken;

export const authCookieOptions = () => {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" as const : "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};
