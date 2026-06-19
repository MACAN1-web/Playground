import Database from "better-sqlite3";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import "../server/env.js";
import { pool, transaction } from "../server/db.js";

const transfer = async () => {
  const sqlitePath = path.resolve(process.env.SQLITE_PATH || "data/ratings.db");
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite-файл не найден: ${sqlitePath}`);
  }

  const migration = await fsPromises.readFile(path.resolve("server/migrations/001_initial.sql"), "utf8");
  await pool.query(migration);

  const sqlite = new Database(sqlitePath, { readonly: true });
  const directions = sqlite.prepare("SELECT * FROM directions ORDER BY id").all() as Array<Record<string, unknown>>;
  const applicants = sqlite.prepare("SELECT * FROM applicants ORDER BY id").all() as Array<Record<string, unknown>>;

  await transaction(async (client) => {
    await client.query("TRUNCATE applicants, directions RESTART IDENTITY CASCADE");

    for (const direction of directions) {
      await client.query(
        `INSERT INTO directions
         (id, specialty, specialty_search, study_form, funding, budget_places, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          direction.id,
          direction.specialty,
          direction.specialty_search || String(direction.specialty).toLowerCase(),
          direction.study_form,
          direction.funding || "Бюджет",
          direction.budget_places,
          direction.updated_at || null
        ]
      );
    }

    for (const applicant of applicants) {
      await client.query(
        `INSERT INTO applicants
         (id, direction_id, position, snils_normalized, average_score, original_status, full_name, full_name_search, original_provided)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          applicant.id,
          applicant.direction_id,
          applicant.position,
          applicant.snils_normalized,
          String(applicant.average_score),
          applicant.original_status,
          applicant.full_name || "",
          applicant.full_name_search || String(applicant.full_name || "").toLowerCase(),
          Boolean(applicant.original_provided)
        ]
      );
    }

    await client.query("SELECT setval(pg_get_serial_sequence('directions', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM directions");
    await client.query("SELECT setval(pg_get_serial_sequence('applicants', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM applicants");
  });

  sqlite.close();
  await pool.end();
  console.log(`Перенесено специальностей: ${directions.length}, абитуриентов: ${applicants.length}`);
};

transfer().catch((error) => {
  console.error("Не удалось перенести данные:", error);
  process.exitCode = 1;
});
