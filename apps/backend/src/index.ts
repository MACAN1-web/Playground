import cors from "cors";
import ExcelJS from "exceljs";
import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import type { PoolClient } from "pg";
import * as XLSX from "xlsx";
import "./env.js";
import { maskSnils, normalizeSnils, pool, query, queryOne, transaction } from "./lib/db.js";
import { requireAuth, requireRole } from "./middlewares/auth.js";
import { authRoutes } from "./routes/auth.routes.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const PRIORITY_ENROLLMENT_LABEL = "первоочередное зачисление";
const allowedOrigins = (process.env.APP_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.AUTH_SECRET) {
  throw new Error("Не задан AUTH_SECRET");
}

if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN) {
  throw new Error("Для production необходимо задать APP_ORIGIN");
}

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; connect-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("CORS origin is not allowed"));
  },
  credentials: true
}));
app.use(express.json({ limit: "64kb" }));
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/auth", authRoutes);

type ParsedApplicant = {
  position: number;
  snils: string;
  averageScore: number | string;
  originalStatus: string;
  fullName: string;
};

type ParsedSheet = {
  sheetName: string;
  specialty: string;
  studyForm: "Очная" | "Заочная" | "Очно-заочная";
  budgetPlaces: number | null;
  hasSnilsColumn: boolean;
  applicants: ParsedApplicant[];
};

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const eventClients = new Set<Response>();

const broadcastRatingsChanged = (reason: string) => {
  const payload = `event: ratings-changed\ndata: ${JSON.stringify({ reason, at: Date.now() })}\n\n`;
  for (const client of eventClients) client.write(payload);
};

const rateLimit = (name: string, limit: number, windowMs: number) =>
  (request: Request, response: Response, next: NextFunction) => {
    const key = `${name}:${request.ip}`;
    const now = Date.now();
    const current = rateLimits.get(key);
    if (!current || current.resetAt <= now) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= limit) {
      response.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return response.status(429).json({ error: "Слишком много запросов. Попробуйте позже." });
    }
    current.count += 1;
    next();
  };

const hasExcelExtension = (filename: string) => /\.(xlsx|xls)$/i.test(filename);

const safeFilenamePart = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");

const extractSpecialtyCode = (specialty: string) => specialty.match(/\d{2}\.\d{2}\.\d{2}/)?.[0] ?? safeFilenamePart(specialty).slice(0, 40);

const ensureSchema = async () => {
  const migration = await fs.readFile(path.resolve("apps/backend/src/migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
};

const parsePlaces = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const places = Number(value);
  return Number.isInteger(places) && places >= 0 ? places : undefined;
};

const normalizeStudyForm = (value: unknown): "Очная" | "Заочная" | "Очно-заочная" => {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/ё/g, "е");
  const compact = normalized.replace(/[\s/_–—-]+/g, "");
  if (
    compact.includes("очнозаоч") ||
    compact.includes("очнаязаоч") ||
    compact.includes("заочнооч") ||
    compact.includes("заочнаяоч")
  ) return "Очно-заочная";
  return compact.includes("заоч") ? "Заочная" : "Очная";
};

const publicApplicant = (row: Record<string, unknown>) => ({
  position: row.position,
  snils: maskSnils(String(row.snils_normalized)),
  averageScore: Boolean(row.priority_enrollment) ? PRIORITY_ENROLLMENT_LABEL : row.average_score,
  originalProvided: Boolean(row.original_provided),
  priorityEnrollment: Boolean(row.priority_enrollment)
});

const rerankDirection = async (directionId: number, client: PoolClient) => {
  await client.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY
          original_provided DESC,
          priority_enrollment DESC,
          CASE WHEN average_score ~ '^[0-9]+([.,][0-9]+)?$' THEN REPLACE(average_score, ',', '.')::DOUBLE PRECISION END DESC NULLS FIRST,
          snils_normalized
      ) AS new_position
      FROM applicants WHERE direction_id = $1
    )
    UPDATE applicants SET position = ranked.new_position
    FROM ranked WHERE applicants.id = ranked.id
  `, [directionId]);
};

const rerankAllDirections = async () => {
  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY direction_id
        ORDER BY
          original_provided DESC,
          priority_enrollment DESC,
          CASE WHEN average_score ~ '^[0-9]+([.,][0-9]+)?$' THEN REPLACE(average_score, ',', '.')::DOUBLE PRECISION END DESC NULLS FIRST,
          snils_normalized
      ) AS new_position
      FROM applicants
    )
    UPDATE applicants SET position = ranked.new_position
    FROM ranked WHERE applicants.id = ranked.id
  `);
};

const findHeaderIndex = (headers: unknown[], variants: string[]) =>
  headers.findIndex((header) => variants.some((variant) => String(header).toLowerCase().includes(variant)));

const parseSheet = (sheet: XLSX.WorkSheet): Omit<ParsedSheet, "sheetName"> => {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const titleRow = rows.find((row) => row.some((cell) => /бюджет/i.test(String(cell)))) ?? rows[0] ?? [];
  const title = String(titleRow.find((cell) => String(cell).trim()) ?? "").trim();
  const budgetMatch = title.match(/бюджет\D*(\d+)\s*мест/i);
  const budgetPlaces = budgetMatch ? Number(budgetMatch[1]) : null;
  const specialty = title.replace(/\s*\(бюджет[\s\S]*$/i, "").trim().replace(/\s+/g, " ");
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => /снилс/i.test(String(cell))) || row.some((cell) => /фио/i.test(String(cell))));
  const headers = rows[headerRowIndex] ?? [];
  const positionIndex = findHeaderIndex(headers, ["место", "№"]);
  const snilsIndex = findHeaderIndex(headers, ["снилс"]);
  const scoreIndex = findHeaderIndex(headers, ["ср.балл", "ср. балл", "средний балл"]);
  const originalIndex = findHeaderIndex(headers, ["оригинал"]);
  const effectivePositionIndex = positionIndex >= 0 ? positionIndex : 0;
  const effectiveScoreIndex = scoreIndex >= 0 ? scoreIndex : 2;

  const applicants = rows.slice(headerRowIndex + 1).flatMap((row) => {
    const position = Number(row[effectivePositionIndex]);
    const snils = snilsIndex >= 0 ? normalizeSnils(row[snilsIndex]) : "";
    const scoreRaw = String(row[effectiveScoreIndex] ?? "").replace(",", ".");
    const numericScore = Number(scoreRaw);
    const averageScore = Number.isFinite(numericScore) ? numericScore : scoreRaw.trim();
    if (!Number.isInteger(position) || !snils) return [];
    return [{
      position,
      snils,
      averageScore,
      originalStatus: originalIndex >= 0 ? String(row[originalIndex] || "Да").trim() : "Да",
      fullName: ""
    }];
  });

  return { specialty, studyForm: "Очная", budgetPlaces, applicants, hasSnilsColumn: snilsIndex >= 0 };
};

const parseRegistry = (sheet: XLSX.WorkSheet): { parsedSheets: ParsedSheet[]; skippedRows: number; mergedDuplicates: number } => {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const grouped = new Map<string, {
    specialty: string;
    studyForm: "Очная" | "Заочная" | "Очно-заочная";
    applicants: Map<string, { snils: string; averageScore: number; originalStatus: string; fullName: string }>;
  }>();
  let skippedRows = 0;
  let mergedDuplicates = 0;

  rows.forEach((row) => {
    const specialty = String(row["Специальность"] ?? "").trim().replace(/\s+/g, " ");
    const studyForm = normalizeStudyForm(row["Форма обучения"]);
    const groupKey = `${specialty.toLowerCase()}::${studyForm}`;
    const snils = normalizeSnils(row["СНИЛС абитуриента"]);
    const averageScore = Number(String(row["Средний балл аттестата"] ?? "").replace(",", "."));
    if (!specialty || snils.length !== 11 || !Number.isFinite(averageScore) || averageScore <= 0) {
      skippedRows += 1;
      return;
    }

    const group = grouped.get(groupKey) ?? { specialty, studyForm, applicants: new Map() };
    const existing = group.applicants.get(snils);
    if (existing) mergedDuplicates += 1;
    if (!existing || averageScore > existing.averageScore) {
      group.applicants.set(snils, {
        snils,
        averageScore,
        originalStatus: String(row["Статус заявления"] || "Не указан").trim(),
        fullName: [row["Фамилия абитуриента"], row["Имя абитуриента"], row["Отчество абитуриента"]]
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join(" ")
      });
    }
    grouped.set(groupKey, group);
  });

  const parsedSheets = [...grouped.values()].map(({ specialty, studyForm, applicants }) => ({
    sheetName: `${specialty} (${studyForm})`,
    specialty,
    studyForm,
    budgetPlaces: null,
    hasSnilsColumn: true,
    applicants: [...applicants.values()]
      .sort((first, second) => second.averageScore - first.averageScore || first.snils.localeCompare(second.snils))
      .map((applicant, index) => ({ ...applicant, position: index + 1 }))
  }));

  return { parsedSheets, skippedRows, mergedDuplicates };
};

app.get("/api/directions", async (_request, response) => {
  const directions = await query(`
    SELECT d.id, d.specialty, d.study_form, d.budget_places, d.paid_places, d.updated_at, COUNT(a.id)::INTEGER AS applicant_count
    FROM directions d LEFT JOIN applicants a ON a.direction_id = d.id
    GROUP BY d.id ORDER BY d.specialty, d.study_form
  `);
  response.json(directions);
});

app.get("/api/directions/:id/applicants", async (request, response) => {
  const direction = await queryOne("SELECT id, specialty, study_form, budget_places, paid_places, updated_at FROM directions WHERE id = $1", [request.params.id]);
  if (!direction) return response.status(404).json({ error: "Направление не найдено" });

  const applicants = await query<Record<string, unknown> & { position: number }>(
    "SELECT a.position, a.snils_normalized, a.average_score, a.original_provided, a.priority_enrollment FROM applicants a WHERE a.direction_id = $1 ORDER BY a.position",
    [request.params.id]
  );
  response.json({ direction, applicants: applicants.map(publicApplicant) });
});

app.get("/api/events", (_request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();
  response.write(": connected\n\n");
  eventClients.add(response);

  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 25_000);
  response.on("close", () => {
    clearInterval(heartbeat);
    eventClients.delete(response);
  });
});

app.post("/api/search", rateLimit("search", 30, 60_000), async (request, response) => {
  const snils = normalizeSnils(request.body.snils);
  if (snils.length !== 11) return response.status(400).json({ error: "Введите 11 цифр СНИЛС" });

  const rows = await query<Record<string, unknown>>(`
    SELECT a.position, a.snils_normalized, a.average_score, a.original_provided,
      a.priority_enrollment,
      d.id AS direction_id, d.specialty, d.study_form, d.budget_places, d.paid_places, d.updated_at
    FROM applicants a JOIN directions d ON d.id = a.direction_id
    WHERE a.snils_normalized = $1 ORDER BY d.specialty
  `, [snils]);
  response.json(rows.map((row) => ({
    direction_id: row.direction_id,
    specialty: row.specialty,
    study_form: row.study_form,
    budget_places: row.budget_places,
    paid_places: row.paid_places,
    updated_at: row.updated_at,
    position: row.position,
    snils: maskSnils(snils),
    average_score: row.average_score,
    originalProvided: Boolean(row.original_provided),
    priorityEnrollment: Boolean(row.priority_enrollment)
  })));
});

app.get("/api/admin/applicants", requireAuth, requireRole("admin"), async (request, response) => {
  const searchTerm = String(request.query.q ?? "").trim();
  if (searchTerm.length < 2) return response.json([]);
  const snils = normalizeSnils(searchTerm);
  const nameQuery = `%${searchTerm.toLowerCase()}%`;
  const rows = await query<Record<string, unknown>>(`
    SELECT a.direction_id, a.snils_normalized, a.full_name, a.original_provided, a.priority_enrollment, a.position, a.average_score,
      d.specialty, d.study_form
    FROM applicants a JOIN directions d ON d.id = a.direction_id
    WHERE ($1 != '' AND a.snils_normalized = $1) OR a.full_name_search LIKE $2 OR d.specialty_search LIKE $2
    ORDER BY a.full_name, d.specialty LIMIT 100
  `, [snils, nameQuery]);
  response.json(rows.map((row) => ({
    fullName: row.full_name,
    directionId: row.direction_id,
    snils: row.snils_normalized,
    snilsNormalized: row.snils_normalized,
    originalProvided: Boolean(row.original_provided),
    priorityEnrollment: Boolean(row.priority_enrollment),
    position: row.position,
    averageScore: row.average_score,
    specialty: row.specialty,
    studyForm: row.study_form
  })));
});

app.get("/api/admin/directions/:id/applicants", requireAuth, requireRole("admin"), async (request, response) => {
  const direction = await queryOne("SELECT id, specialty, study_form, budget_places, paid_places, updated_at FROM directions WHERE id = $1", [request.params.id]);
  if (!direction) return response.status(404).json({ error: "Специальность не найдена" });

  const rows = await query<Record<string, unknown>>(`
    SELECT position, snils_normalized, full_name, average_score, original_provided, priority_enrollment
    FROM applicants WHERE direction_id = $1 ORDER BY position
  `, [request.params.id]);
  response.json({
    direction,
    applicants: rows.map((row) => ({
      fullName: row.full_name,
      snils: row.snils_normalized,
      snilsNormalized: row.snils_normalized,
      originalProvided: Boolean(row.original_provided),
      priorityEnrollment: Boolean(row.priority_enrollment),
      position: row.position,
      averageScore: row.average_score
    }))
  });
});

app.patch("/api/admin/applicants/:snils/original", rateLimit("admin-write", 240, 60_000), requireAuth, requireRole("admin"), async (request, response) => {
  const snils = normalizeSnils(request.params.snils);
  if (snils.length !== 11) return response.status(400).json({ error: "Некорректный СНИЛС" });
  const directionId = Number(request.body.directionId);
  if (!Number.isInteger(directionId)) return response.status(400).json({ error: "Некорректная специальность" });
  const originalProvided = request.body.originalProvided === true;
  const applicant = await queryOne<{ direction_id: number }>(
    "SELECT direction_id FROM applicants WHERE snils_normalized = $1 AND direction_id = $2",
    [snils, directionId]
  );
  if (!applicant) return response.status(404).json({ error: "Абитуриент не найден в выбранной специальности" });
  const affectedDirections = await query<{ direction_id: number }>(
    "SELECT DISTINCT direction_id FROM applicants WHERE snils_normalized = $1",
    [snils]
  );

  await transaction(async (client) => {
    await client.query("UPDATE applicants SET original_provided = FALSE WHERE snils_normalized = $1", [snils]);
    if (originalProvided) {
      await client.query(
        "UPDATE applicants SET original_provided = TRUE WHERE snils_normalized = $1 AND direction_id = $2",
        [snils, directionId]
      );
    }
    for (const { direction_id } of affectedDirections) await rerankDirection(direction_id, client);
  });
  broadcastRatingsChanged("original");
  response.json({ updatedDirection: directionId, affectedDirections: affectedDirections.length });
});

app.patch("/api/admin/applicants/:snils/priority", rateLimit("admin-write", 240, 60_000), requireAuth, requireRole("admin"), async (request, response) => {
  const snils = normalizeSnils(request.params.snils);
  if (snils.length !== 11) return response.status(400).json({ error: "Некорректный СНИЛС" });
  const directionId = Number(request.body.directionId);
  if (!Number.isInteger(directionId)) return response.status(400).json({ error: "Некорректная специальность" });
  const priorityEnrollment = request.body.priorityEnrollment === true;
  const applicant = await queryOne<{ direction_id: number }>(
    "SELECT direction_id FROM applicants WHERE snils_normalized = $1 AND direction_id = $2",
    [snils, directionId]
  );
  if (!applicant) return response.status(404).json({ error: "Абитуриент не найден в выбранной специальности" });

  await transaction(async (client) => {
    await client.query(
      "UPDATE applicants SET priority_enrollment = $1 WHERE snils_normalized = $2 AND direction_id = $3",
      [priorityEnrollment, snils, directionId]
    );
    await rerankDirection(directionId, client);
  });
  broadcastRatingsChanged("priority");
  response.json({ updatedDirection: directionId });
});

const updateDirectionPlaces = async (request: Request, response: Response) => {
  const budgetPlaces = parsePlaces(request.body.budgetPlaces);
  const paidPlaces = parsePlaces(request.body.paidPlaces);
  if (budgetPlaces === undefined || paidPlaces === undefined) {
    return response.status(400).json({ error: "Количество мест должно быть целым числом от 0 или пустым" });
  }
  const updated = await queryOne(
    `UPDATE directions SET budget_places = $1, paid_places = $2, updated_at = COALESCE(updated_at, NOW())
     WHERE id = $3 RETURNING id`,
    [budgetPlaces, paidPlaces, request.params.id]
  );
  if (!updated) return response.status(404).json({ error: "Специальность не найдена" });
  broadcastRatingsChanged("places");
  response.json({ id: updated.id, budgetPlaces, paidPlaces });
};

app.post("/api/admin/directions/:id/places", rateLimit("admin-write", 240, 60_000), requireAuth, requireRole("admin"), updateDirectionPlaces);
app.patch("/api/admin/directions/:id/places", rateLimit("admin-write", 240, 60_000), requireAuth, requireRole("admin"), updateDirectionPlaces);

app.get("/api/admin/directions/:id/export-originals", rateLimit("admin-export", 60, 60_000), requireAuth, requireRole("admin"), async (request, response) => {
  const direction = await queryOne<{
    id: number;
    specialty: string;
    budget_places: number | null;
    paid_places: number | null;
  }>(
    "SELECT id, specialty, budget_places, paid_places FROM directions WHERE id = $1",
    [request.params.id]
  );
  if (!direction) return response.status(404).json({ error: "Специальность не найдена" });

  const applicants = await query<{
    position: number;
    full_name: string;
    average_score: string;
    priority_enrollment: boolean;
  }>(
    `SELECT position, full_name, average_score, priority_enrollment
     FROM applicants
     WHERE direction_id = $1 AND original_provided = TRUE
     ORDER BY position`,
    [direction.id]
  );
  if (!applicants.length) {
    return response.status(400).json({ error: "Нет абитуриентов с оригиналом для выгрузки" });
  }

  const budgetPlaces = direction.budget_places ?? 0;
  const paidPlaces = direction.paid_places ?? 0;
  const placesLimit = budgetPlaces + paidPlaces;
  if (placesLimit <= 0) {
    return response.status(400).json({ error: "Заполните количество бюджетных или внебюджетных мест" });
  }
  const exportedApplicants = placesLimit > 0 ? applicants.slice(0, placesLimit) : applicants;
  const title = `${direction.specialty} (бюджет ${budgetPlaces} мест)`;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Оригиналы", { views: [{ showGridLines: false }] });
  worksheet.columns = [
    { width: 10 },
    { width: Math.max(46, Math.ceil(title.length * 1.35)) },
    { width: 28 }
  ];
  worksheet.getCell("B1").value = title;
  worksheet.addRow([]);
  worksheet.addRow(["", "ФИО", "Средний балл"]);
  exportedApplicants.forEach((applicant, index) => {
    worksheet.addRow([
      index + 1,
      applicant.full_name || "ФИО не указано",
      applicant.priority_enrollment ? "Первоочередное зачисление" : applicant.average_score
    ]);
  });

  const border: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } }
  };
  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 24 : 22;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      if (columnNumber > 3) return;
      cell.font = { name: "Arial", size: rowNumber === 1 ? 14 : 12, bold: rowNumber === 1 || rowNumber === 3 };
      cell.alignment = {
        horizontal: rowNumber >= 4 && columnNumber === 2 ? "left" : "center",
        vertical: "middle",
        wrapText: rowNumber !== 1
      };
      cell.border = border;
      if (rowNumber >= 4 && rowNumber - 3 > budgetPlaces) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Оригиналы_аттестатов_${extractSpecialtyCode(direction.specialty)}.xlsx`;
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  response.send(buffer);
});

app.post("/api/admin/import-workbook", rateLimit("admin-import", 20, 15 * 60_000), requireAuth, requireRole("admin"), upload.single("file"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Выберите Excel-файл" });
  if (!hasExcelExtension(request.file.originalname)) {
    return response.status(400).json({ error: "Можно загружать только .xls или .xlsx файлы" });
  }

  try {
    const workbook = XLSX.read(request.file.buffer, { type: "buffer", cellStyles: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const firstRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: false });
    const firstHeaders = firstRows[0]?.map((cell) => String(cell).trim()) ?? [];
    const isRegistry = firstHeaders.includes("Специальность") && firstHeaders.includes("СНИЛС абитуриента");
    const registry = isRegistry ? parseRegistry(firstSheet) : null;
    const parsedSheets: ParsedSheet[] = registry?.parsedSheets ?? workbook.SheetNames.map((sheetName) => ({
      sheetName,
      ...parseSheet(workbook.Sheets[sheetName])
    })).filter((item) => item.specialty);
    if (parsedSheets.length === 0 || parsedSheets.length > 50) {
      return response.status(400).json({ error: "В файле должно быть от 1 до 50 листов со специальностями" });
    }
    if (parsedSheets.reduce((sum, sheet) => sum + sheet.applicants.length, 0) > 100_000) {
      return response.status(400).json({ error: "В файле слишком много записей" });
    }
    const missingSnilsSheets = parsedSheets.filter((item) => !item.hasSnilsColumn).map((item) => item.sheetName);
    if (missingSnilsSheets.length) {
      return response.status(400).json({
        error: `В файле нет столбца СНИЛС на листах: ${missingSnilsSheets.join(", ")}. Добавьте СНИЛС и загрузите файл снова.`
      });
    }
    const invalidSheets = parsedSheets.filter((item) =>
      (!isRegistry && (!Number.isInteger(item.budgetPlaces) || item.budgetPlaces === null || item.budgetPlaces < 0)) ||
      item.applicants.length === 0 ||
      item.applicants.some((applicant) => applicant.snils.length !== 11) ||
      new Set(item.applicants.map((applicant) => applicant.snils)).size !== item.applicants.length
    ).map((item) => item.sheetName);
    if (invalidSheets.length) {
      return response.status(400).json({
        error: `Проверьте бюджетные места, СНИЛС и дубликаты на листах: ${invalidSheets.join(", ")}`
      });
    }
    const directionKeys = parsedSheets.map((item) => `${item.specialty.toLowerCase().replace(/\s+/g, " ")}::${item.studyForm}`);
    if (new Set(directionKeys).size !== directionKeys.length) {
      return response.status(400).json({ error: "В файле найдены повторяющиеся специальности с одинаковой формой обучения" });
    }

    await transaction(async (client) => {
      const originals = new Set(
        (await query<{ direction_id: number; snils_normalized: string }>(
          "SELECT direction_id, snils_normalized FROM applicants WHERE original_provided = TRUE",
          [],
          client
        )).map((item) => `${item.direction_id}:${item.snils_normalized}`)
      );
      const priorities = new Set(
        (await query<{ direction_id: number; snils_normalized: string }>(
          "SELECT direction_id, snils_normalized FROM applicants WHERE priority_enrollment = TRUE",
          [],
          client
        )).map((item) => `${item.direction_id}:${item.snils_normalized}`)
      );
      const publishedDirectionIds: number[] = [];

      for (const sheet of parsedSheets) {
        const existing = await queryOne<{ id: number }>(
          "SELECT id FROM directions WHERE specialty = $1 AND study_form = $2 LIMIT 1",
          [sheet.specialty, sheet.studyForm],
          client
        );
        const created = existing ?? await queryOne<{ id: number }>(
          `INSERT INTO directions (specialty, specialty_search, study_form, funding, budget_places)
           VALUES ($1, $2, $3, 'Бюджет', $4) RETURNING id`,
          [sheet.specialty, sheet.specialty.toLowerCase(), sheet.studyForm, sheet.budgetPlaces],
          client
        );
        const directionId = created.id;
        publishedDirectionIds.push(directionId);
        await client.query("DELETE FROM applicants WHERE direction_id = $1", [directionId]);
        for (const item of sheet.applicants) {
          await client.query(
            `INSERT INTO applicants
             (direction_id, position, snils_normalized, average_score, original_status, full_name, full_name_search, original_provided, priority_enrollment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [directionId, item.position, item.snils, String(item.averageScore), item.originalStatus, item.fullName, item.fullName.toLowerCase(), originals.has(`${directionId}:${item.snils}`), priorities.has(`${directionId}:${item.snils}`)]
          );
        }
        await rerankDirection(directionId, client);
        await client.query(
          "UPDATE directions SET budget_places = COALESCE($1, budget_places), specialty_search = $2, updated_at = NOW() WHERE id = $3",
          [sheet.budgetPlaces, sheet.specialty.toLowerCase(), directionId]
        );
      }

      await client.query("DELETE FROM directions WHERE NOT (id = ANY($1::INTEGER[]))", [publishedDirectionIds]);
    });
    response.json({
      importedSheets: parsedSheets.length,
      importedApplicants: parsedSheets.reduce((sum, sheet) => sum + sheet.applicants.length, 0),
      skippedRows: registry?.skippedRows ?? 0,
      mergedDuplicates: registry?.mergedDuplicates ?? 0
    });
    broadcastRatingsChanged("import");
  } catch {
    response.status(400).json({ error: "Не удалось прочитать структуру Excel-файла" });
  }
});

app.delete("/api/admin/directions", rateLimit("admin-write", 240, 60_000), requireAuth, requireRole("admin"), async (_request, response) => {
  await query("DELETE FROM directions");
  broadcastRatingsChanged("delete");
  response.status(204).end();
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API endpoint не найден" });
});

app.use((error: Error, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) return next(error);
  if (error.message === "CORS origin is not allowed") {
    return response.status(403).json({ error: "Источник запроса запрещён" });
  }
  response.status(500).json({ error: "Внутренняя ошибка сервера" });
});

const start = async () => {
  await ensureSchema();
  await pool.query("SELECT 1");
  await rerankAllDirections();
  app.listen(Number(process.env.PORT || 3001), () => {
    console.log(`API started on http://localhost:${process.env.PORT || 3001}`);
  });
};

start().catch((error) => {
  console.error("Не удалось запустить API:", error);
  process.exitCode = 1;
});
