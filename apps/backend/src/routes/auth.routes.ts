import { Router } from "express";
import { login, logout, refresh } from "../controllers/auth.controller.js";
import { rateLimit } from "../middlewares/rateLimit.js";

export const authRoutes = Router();

authRoutes.post("/login", rateLimit("login", 8, 15 * 60_000), login);
authRoutes.post("/refresh", rateLimit("refresh", 60, 60_000), refresh);
authRoutes.post("/logout", logout);
