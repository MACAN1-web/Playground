import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string };
    }
  }
}

export const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return response.status(401).json({ error: "Требуется авторизация" });

  const payload = verifyAccessToken(token);
  if (!payload) return response.status(401).json({ error: "Сессия истекла или токен недействителен" });

  request.user = { id: payload.sub, role: payload.role };
  next();
};

export const requireRole = (role: string) =>
  (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) return response.status(401).json({ error: "Требуется авторизация" });
    if (request.user.role !== role) return response.status(403).json({ error: "Недостаточно прав" });
    next();
  };
