import crypto from "node:crypto";

export type JwtPayload = {
  sub: number;
  role: string;
  type: "access";
  exp: number;
};

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

const secret = () => {
  if (!process.env.AUTH_SECRET) throw new Error("Не задан AUTH_SECRET");
  return process.env.AUTH_SECRET;
};

export const signAccessToken = (payload: Omit<JwtPayload, "type" | "exp">) => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({
    ...payload,
    type: "access",
    exp: Math.floor(Date.now() / 1000) + 15 * 60
  }));
  const signature = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};

export const verifyAccessToken = (token: string): JwtPayload | null => {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as JwtPayload;
  if (payload.type !== "access" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
};

export const createRefreshToken = () => crypto.randomBytes(48).toString("base64url");

export const hashRefreshToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
