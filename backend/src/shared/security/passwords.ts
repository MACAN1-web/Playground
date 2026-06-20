import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
};

export const verifyPassword = async (password: string, passwordHash: string) => {
  const [algorithm, salt, storedHash] = passwordHash.split(":");
  if (algorithm !== "scrypt" || !salt || !storedHash) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
};
