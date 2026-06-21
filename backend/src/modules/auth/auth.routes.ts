import { Router } from "express";
import { login, logout, me, refresh } from "./auth.controller.js";
import { rateLimit } from "../../shared/middlewares/rateLimit.js";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.js";

export const authRoutes = Router();

authRoutes.get("/me", requireAuth, requireRole("admin"), me);
authRoutes.post("/login", rateLimit("login", 8, 15 * 60_000), login);
authRoutes.post("/refresh", rateLimit("refresh", 60, 60_000), refresh);
authRoutes.post("/logout", logout);
