import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const secret = process.env.AUTH_SECRET || "development-only-secret";

const sign = (value: string) =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");

export const createToken = () => {
  const expiresAt = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
};

export const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return response.status(401).json({ error: "Требуется авторизация" });

  const [expiresAt, signature] = token.split(".");
  const expectedSignature = expiresAt ? sign(expiresAt) : "";
  const valid =
    expiresAt &&
    signature &&
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature)) &&
    Number(expiresAt) > Date.now();

  if (!valid) return response.status(401).json({ error: "Сессия истекла" });
  next();
};
