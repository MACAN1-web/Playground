import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./shared/db/db.js";

const run = async () => {
  const sourcePath = path.resolve("src/migrations/001_initial.sql");
  const buildPath = path.resolve("dist/migrations/001_initial.sql");
  const migrationPath = await fs.access(sourcePath).then(() => sourcePath).catch(() => buildPath);
  const migration = await fs.readFile(migrationPath, "utf8");
  await pool.query(migration);
  await pool.end();
  console.log("Миграции применены");
};

run().catch((error) => {
  console.error("Не удалось применить миграции:", error);
  process.exitCode = 1;
});
