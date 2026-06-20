import type { Request, Response } from "express";
import { clearRefreshCookie, createSession, getRefreshCookieName, loginUser, logoutSession, parseCookies, refreshSession, setRefreshCookie } from "./auth.service.js";

export const login = async (request: Request, response: Response) => {
  const email = String(request.body.email ?? "").trim();
  const password = String(request.body.password ?? "");
  if (!email || !password) return response.status(400).json({ error: "Введите email и пароль" });

  const user = await loginUser(email, password);
  if (!user) return response.status(401).json({ error: "Неверный email или пароль" });

  const session = await createSession({ id: user.id, role: user.role });
  setRefreshCookie(response, session.refreshToken);
  response.json({ accessToken: session.accessToken, user: { id: user.id, email: user.email, role: user.role } });
};

export const refresh = async (request: Request, response: Response) => {
  const refreshToken = parseCookies(request.headers.cookie).refresh_token;
  if (!refreshToken) return response.status(401).json({ error: "Refresh token отсутствует" });

  const session = await refreshSession(refreshToken);
  if (!session) {
    clearRefreshCookie(response);
    return response.status(401).json({ error: "Refresh token недействителен" });
  }

  setRefreshCookie(response, session.refreshToken);
  response.json({ accessToken: session.accessToken });
};

export const logout = async (request: Request, response: Response) => {
  await logoutSession(parseCookies(request.headers.cookie)[getRefreshCookieName()]);
  clearRefreshCookie(response);
  response.status(204).end();
};
