import fs from "node:fs/promises";
import path from "node:path";
import "./env.js";
import { pool } from "./db.js";

const migrate = async () => {
  const migration = await fs.readFile(path.resolve("server/migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
  await pool.end();
  console.log("PostgreSQL schema is ready");
};

migrate().catch((error) => {
  console.error("Не удалось выполнить миграцию:", error);
  process.exitCode = 1;
});
