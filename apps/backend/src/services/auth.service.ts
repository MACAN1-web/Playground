import type { Response } from "express";
import { queryOne } from "../lib/db.js";
import { createRefreshToken, hashRefreshToken, signAccessToken } from "../lib/jwt.js";
import { verifyPassword } from "../lib/passwords.js";

export type AuthUser = {
  id: number;
  email: string;
  password_hash: string;
  role: string;
};

const refreshCookieName = "refresh_token";
const refreshMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

export const getRefreshCookieName = () => refreshCookieName;

export const parseCookies = (cookieHeader = "") =>
  Object.fromEntries(cookieHeader.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }).filter(([key]) => key));

export const setRefreshCookie = (response: Response, token: string) => {
  response.cookie(refreshCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: refreshMaxAgeMs,
    path: "/api/auth"
  });
};

export const clearRefreshCookie = (response: Response) => {
  response.clearCookie(refreshCookieName, { path: "/api/auth" });
};

export const createSession = async (user: Pick<AuthUser, "id" | "role">) => {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = createRefreshToken();
  await queryOne(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days') RETURNING id`,
    [user.id, hashRefreshToken(refreshToken)]
  );
  return { accessToken, refreshToken };
};

export const loginUser = async (email: string, password: string) => {
  const user = await queryOne<AuthUser>("SELECT id, email, password_hash, role FROM users WHERE lower(email) = lower($1)", [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;
  return user;
};

export const refreshSession = async (refreshToken: string) => {
  const tokenHash = hashRefreshToken(refreshToken);
  const row = await queryOne<{ id: number; user_id: number; role: string }>(
    `SELECT rt.id, rt.user_id, u.role
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
    [tokenHash]
  );
  if (!row) return null;

  await queryOne("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 RETURNING id", [row.id]);
  return createSession({ id: row.user_id, role: row.role });
};

export const logoutSession = async (refreshToken: string | undefined) => {
  if (!refreshToken) return;
  await queryOne("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 RETURNING id", [hashRefreshToken(refreshToken)]);
};
