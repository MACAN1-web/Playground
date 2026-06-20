import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./lib/db.js";

const run = async () => {
  const migration = await fs.readFile(path.resolve("apps/backend/src/migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
  await pool.end();
  console.log("Миграции применены");
};

run().catch((error) => {
  console.error("Не удалось применить миграции:", error);
  process.exitCode = 1;
});
