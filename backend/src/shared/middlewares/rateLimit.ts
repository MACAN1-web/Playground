import type { NextFunction, Request, Response } from "express";

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (name: string, limit: number, windowMs: number) =>
  (request: Request, response: Response, next: NextFunction) => {
    const key = `${name}:${request.ip}`;
    const now = Date.now();
    const current = rateLimits.get(key);
    if (!current || current.resetAt <= now) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= limit) {
      response.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return response.status(429).json({ error: "Слишком много запросов. Попробуйте позже." });
    }
    current.count += 1;
    next();
  };
