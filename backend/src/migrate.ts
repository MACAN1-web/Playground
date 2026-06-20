import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./shared/db/db.js";

const run = async () => {
  const migration = await fs.readFile(path.resolve("src/migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
  await pool.end();
  console.log("Миграции применены");
};

run().catch((error) => {
  console.error("Не удалось применить миграции:", error);
  process.exitCode = 1;
});
