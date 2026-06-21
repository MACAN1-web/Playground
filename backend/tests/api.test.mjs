import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import * as XLSX from "xlsx";
import { promisify } from "node:util";

XLSX.set_fs(fs);
const scrypt = promisify(crypto.scrypt);

const port = 3100 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "college-rating-api-"));
const workbookPath = path.join(testDir, "ratings.xlsx");
const invalidWorkbookPath = path.join(testDir, "invalid-ratings.xlsx");
const registryPath = path.join(testDir, "registry.xlsx");
let server;
let serverOutput = "";
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgresql://college_app:local-development-password@localhost:5432/college_rating";
const schema = `test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const testUrl = new URL(databaseUrl);
testUrl.searchParams.set("options", `-csearch_path=${schema}`);
const testDatabaseUrl = testUrl.toString();
const adminDatabase = new pg.Pool({ connectionString: databaseUrl });
const database = new pg.Pool({ connectionString: testDatabaseUrl });

const request = async (url, options) => {
  const response = await fetch(`${baseUrl}${url}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
};

const createWorkbook = () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["", "09.02.07 Тестовая специальность (бюджет 2 мест)"],
    ["Место", "ФИО", "Ср.Балл", "СНИЛС"],
    [1, "Первый", "первоочередное зачисление", "90100000001"],
    [2, "Второй", 4.8, "90100000002"],
    [3, "Третий", 4.5, "90100000003"]
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "ИСП");
  XLSX.writeFile(workbook, workbookPath);

  const invalidWorkbook = XLSX.utils.book_new();
  const invalidSheet = XLSX.utils.aoa_to_sheet([
    ["", "09.02.07 Тестовая специальность (бюджет 2 мест)"],
    ["Место", "ФИО", "Ср.Балл", "СНИЛС"],
    [1, "Первый", 5, "90100000001"],
    [2, "Второй", 4.8, "90100000001"]
  ]);
  XLSX.utils.book_append_sheet(invalidWorkbook, invalidSheet, "ИСП");
  XLSX.writeFile(invalidWorkbook, invalidWorkbookPath);

  const registry = XLSX.utils.book_new();
  const registrySheet = XLSX.utils.json_to_sheet([
    { "Специальность": "Первая специальность", "Форма обучения": "Очная", "Фамилия абитуриента": "Иванов", "Имя абитуриента": "Иван", "Отчество абитуриента": "Иванович", "СНИЛС абитуриента": "901-000-000 01", "Средний балл аттестата": 4.5, "Статус заявления": "Рекомендован" },
    { "Специальность": "Первая специальность", "Форма обучения": "Очная", "Фамилия абитуриента": "Иванов", "Имя абитуриента": "Иван", "Отчество абитуриента": "Иванович", "СНИЛС абитуриента": "901-000-000 01", "Средний балл аттестата": 4.2, "Статус заявления": "Отклонено" },
    { "Специальность": "Первая специальность", "Форма обучения": "Очная", "Фамилия абитуриента": "Петров", "Имя абитуриента": "Пётр", "Отчество абитуриента": "Петрович", "СНИЛС абитуриента": "901-000-000 02", "Средний балл аттестата": 4.3, "Статус заявления": "Рекомендован" },
    { "Специальность": "Первая специальность", "Форма обучения": "Очная", "Фамилия абитуриента": "Сидоров", "Имя абитуриента": "Сидор", "Отчество абитуриента": "Сидорович", "СНИЛС абитуриента": "901-000-000 03", "Средний балл аттестата": 4.8, "Статус заявления": "Рекомендован" },
    { "Специальность": "Первая специальность", "Форма обучения": "Заочная", "Фамилия абитуриента": "Заочников", "Имя абитуриента": "Захар", "Отчество абитуриента": "Захарович", "СНИЛС абитуриента": "901-000-000 04", "Средний балл аттестата": 4.9, "Статус заявления": "Рекомендован" },
    { "Специальность": "Первая специальность", "Форма обучения": "очно-заочная", "Фамилия абитуриента": "Вечеров", "Имя абитуриента": "Виктор", "Отчество абитуриента": "Викторович", "СНИЛС абитуриента": "901-000-000 05", "Средний балл аттестата": 4.7, "Статус заявления": "Рекомендован" },
    { "Специальность": "Вторая специальность", "Форма обучения": "Очная", "Фамилия абитуриента": "Иванов", "Имя абитуриента": "Иван", "Отчество абитуриента": "Иванович", "СНИЛС абитуриента": "901-000-000 01", "Средний балл аттестата": 4.5, "Статус заявления": "Рекомендован" }
  ]);
  XLSX.utils.book_append_sheet(registry, registrySheet, "Реестр");
  XLSX.writeFile(registry, registryPath);
};

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString("hex")}`;
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/directions`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Сервер не запустился\n${serverOutput}`);
};

test.before(async () => {
  createWorkbook();
  await adminDatabase.query(`CREATE SCHEMA ${schema}`);
  const migration = fs.readFileSync(path.resolve("src/migrations/001_initial.sql"), "utf8");
  await database.query(migration);
  await database.query(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')",
    ["admin@example.com", await hashPassword("test-password")]
  );
  await database.query(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'user')",
    ["user@example.com", await hashPassword("test-password")]
  );
  server = spawn(process.execPath, ["--import", "tsx", path.resolve("src/index.ts")], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      AUTH_SECRET: "test-secret",
      APP_ORIGIN: "http://localhost:5173,http://localhost:5174",
      DATABASE_URL: testDatabaseUrl
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
  await waitForServer();
});

test.after(async () => {
  server?.kill();
  await database.end();
  await adminDatabase.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminDatabase.end();
  fs.rmSync(testDir, { recursive: true, force: true });
});

test("защищает админские эндпоинты", async () => {
  const { response } = await request("/api/admin/applicants?q=Иванов");
  assert.equal(response.status, 401);

  const invalid = await request("/api/admin/applicants?q=Иванов", {
    headers: { Authorization: "Bearer invalid-token" }
  });
  assert.equal(invalid.response.status, 401);

  const userLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "test-password" })
  });
  const forbidden = await request("/api/admin/applicants?q=Иванов", {
    headers: { Authorization: `Bearer ${userLogin.body.accessToken}` }
  });
  assert.equal(forbidden.response.status, 403);

  const forbiddenWrite = await request("/api/admin/directions/1/places", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${userLogin.body.accessToken}` },
    body: JSON.stringify({ budgetPlaces: 1, paidPlaces: 1 })
  });
  assert.equal(forbiddenWrite.response.status, 403);
});

test("проверяет валидность токена для админской сессии", async () => {
  const withoutToken = await request("/api/auth/me");
  assert.equal(withoutToken.response.status, 401);

  const invalidToken = await request("/api/auth/me", {
    headers: { Authorization: "Bearer invalid-token" }
  });
  assert.equal(invalidToken.response.status, 401);

  const userLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "test-password" })
  });
  const regularUser = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${userLogin.body.accessToken}` }
  });
  assert.equal(regularUser.response.status, 403);

  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const adminUser = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${adminLogin.body.accessToken}` }
  });
  assert.equal(adminUser.response.status, 200);
  assert.equal(adminUser.body.user.role, "admin");
});

test("обновляет access token через refresh cookie", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const cookie = login.response.headers.getSetCookie?.()[0] ?? login.response.headers.get("set-cookie");
  assert.ok(cookie?.includes("refresh_token="));

  const refreshed = await request("/api/auth/refresh", {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(refreshed.response.status, 200);
  assert.ok(refreshed.body.accessToken);
  const rotatedCookie = refreshed.response.headers.getSetCookie?.()[0] ?? refreshed.response.headers.get("set-cookie");
  assert.ok(rotatedCookie?.includes("refresh_token="));

  const protectedRequest = await request("/api/admin/applicants?q=Иванов", {
    headers: { Authorization: `Bearer ${refreshed.body.accessToken}` }
  });
  assert.equal(protectedRequest.response.status, 200);

  const reusedOldRefresh = await request("/api/auth/refresh", {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(reusedOldRefresh.response.status, 401);

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: rotatedCookie }
  });
  assert.equal(logout.response.status, 204);

  const refreshAfterLogout = await request("/api/auth/refresh", {
    method: "POST",
    headers: { Cookie: rotatedCookie }
  });
  assert.equal(refreshAfterLogout.response.status, 401);
});

test("разрешает CORS только доверенным origin", async () => {
  const allowed = await fetch(`${baseUrl}/api/directions`, {
    headers: { Origin: "http://localhost:5173" }
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");

  const blocked = await fetch(`${baseUrl}/api/directions`, {
    headers: { Origin: "http://evil.example" }
  });
  assert.equal(blocked.status, 403);
});

test("импортирует общий Excel и маскирует СНИЛС", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  assert.equal(login.response.status, 200);

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(workbookPath)]), "ratings.xlsx");
  const imported = await request("/api/admin/import-workbook", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.accessToken}` },
    body: form
  });
  assert.deepEqual(imported.body, { importedSheets: 1, importedApplicants: 3, skippedRows: 0, mergedDuplicates: 0 });

  const directions = await request("/api/directions");
  assert.equal(directions.body[0].specialty, "09.02.07 Тестовая специальность");
  assert.equal(directions.body[0].budget_places, 2);
  assert.equal(directions.body[0].paid_places, null);

  const list = await request(`/api/directions/${directions.body[0].id}/applicants`);
  assert.equal(list.body.applicants[0].snils, "901*****001");
  assert.equal(list.body.applicants[0].averageScore, "первоочередное зачисление");
  assert.equal(list.body.applicants[2].position, 3);
  assert.equal(Object.hasOwn(list.body.applicants[0], "originalStatus"), false);
  assert.equal(Object.hasOwn(list.body.applicants[0], "fullName"), false);
  assert.equal(Object.hasOwn(list.body.applicants[0], "snils_normalized"), false);
  assert.equal(list.body.applicants[0].originalProvided, false);
  assert.equal(list.body.applicants[0].priorityEnrollment, false);

  const search = await request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snils: "901-000-000 03" })
  });
  assert.equal(search.body[0].snils, "901*****003");
  assert.equal(search.body[0].snils_normalized, undefined);
  assert.equal(search.body[0].fullName, undefined);
  assert.equal(search.body[0].originalProvided, false);
  assert.equal(search.body[0].priorityEnrollment, false);
  assert.equal(search.body[0].original_provided, undefined);
});

test("не заменяет рейтинг ошибочным файлом", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(invalidWorkbookPath)]), "invalid-ratings.xlsx");
  const imported = await request("/api/admin/import-workbook", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.accessToken}` },
    body: form
  });
  assert.equal(imported.response.status, 400);
  const directions = await request("/api/directions");
  assert.equal(directions.body[0].applicant_count, 3);
});

test("сохраняет места и удаляет все специальности", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const directions = await request("/api/directions");
  const places = await request(`/api/admin/directions/${directions.body[0].id}/places`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ budgetPlaces: 25, paidPlaces: 10 })
  });
  assert.equal(places.response.status, 200);

  const updated = await request("/api/directions");
  assert.equal(updated.body[0].budget_places, 25);
  assert.equal(updated.body[0].paid_places, 10);

  const removed = await request("/api/admin/directions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({})
  });
  assert.equal(removed.response.status, 204);
  assert.deepEqual((await request("/api/directions")).body, []);
});

test("распределяет одного абитуриента по нескольким специальностям", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(registryPath)]), "registry.xlsx");
  const imported = await request("/api/admin/import-workbook", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.accessToken}` },
    body: form
  });
  assert.deepEqual(imported.body, { importedSheets: 4, importedApplicants: 6, skippedRows: 0, mergedDuplicates: 1 });

  const search = await request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snils: "90100000001" })
  });
  assert.equal(search.body.length, 2);
  assert.deepEqual(search.body.map((item) => `${item.specialty} ${item.study_form}`).sort(), ["Вторая специальность Очная", "Первая специальность Очная"]);

  const directions = await request("/api/directions");
  assert.equal(directions.body.length, 4);
  assert.equal(directions.body.filter((item) => item.specialty === "Первая специальность").length, 3);
  assert.equal(directions.body.find((item) => item.specialty === "Первая специальность" && item.study_form === "Очная").applicant_count, 3);
  assert.equal(directions.body.find((item) => item.specialty === "Первая специальность" && item.study_form === "Заочная").applicant_count, 1);
  assert.equal(directions.body.find((item) => item.specialty === "Первая специальность" && item.study_form === "Очно-заочная").applicant_count, 1);
});

test("ищет по ФИО и применяет приоритеты зачисления", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const found = await request("/api/admin/applicants?q=Петров", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(found.body.length, 1);
  assert.equal(found.body[0].fullName, "Петров Пётр Петрович");
  assert.equal(found.body[0].snils, "90100000002");

  const updated = await request("/api/admin/applicants/90100000002/original", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ directionId: found.body[0].directionId, originalProvided: true })
  });
  assert.equal(updated.body.updatedDirection, found.body[0].directionId);

  const directions = await request("/api/directions");
  const firstDirection = directions.body.find((item) => item.specialty === "Первая специальность" && item.study_form === "Очная");
  const privateList = await request(`/api/admin/directions/${firstDirection.id}/applicants`, {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(privateList.body.applicants[0].fullName, "Петров Пётр Петрович");
  assert.equal(privateList.body.applicants[0].snils, "90100000002");
  assert.equal(privateList.body.applicants[0].averageScore, "4.3");
  assert.equal(privateList.body.applicants[0].originalProvided, true);
  assert.equal(privateList.body.applicants[1].fullName, "Сидоров Сидор Сидорович");
  assert.equal(privateList.body.applicants[1].averageScore, "4.8");
  assert.equal(privateList.body.applicants[2].fullName, "Иванов Иван Иванович");
  assert.equal(privateList.body.applicants[2].averageScore, "4.5");
  const list = await request(`/api/directions/${firstDirection.id}/applicants`);
  assert.equal(list.body.applicants[0].snils, "901*****002");
  assert.equal(list.body.applicants[0].originalProvided, true);

  const reimport = new FormData();
  reimport.append("file", new Blob([fs.readFileSync(registryPath)]), "registry.xlsx");
  await request("/api/admin/import-workbook", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.accessToken}` },
    body: reimport
  });
  const preserved = await request("/api/admin/applicants?q=90100000002", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(preserved.body[0].originalProvided, true);

  const ivanov = await request("/api/admin/applicants?q=Иванов", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(ivanov.body.length, 2);
  const firstDirectionApplicant = ivanov.body.find((item) => item.specialty === "Первая специальность");
  const firstUpdated = await request("/api/admin/applicants/90100000001/original", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ directionId: firstDirectionApplicant.directionId, originalProvided: true })
  });
  assert.equal(firstUpdated.body.updatedDirection, firstDirection.id);
  const firstDirectionWithTwoOriginals = await request(`/api/admin/directions/${firstDirection.id}/applicants`, {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(firstDirectionWithTwoOriginals.body.applicants[0].fullName, "Иванов Иван Иванович");
  assert.equal(firstDirectionWithTwoOriginals.body.applicants[0].averageScore, "4.5");
  assert.equal(firstDirectionWithTwoOriginals.body.applicants[1].fullName, "Петров Пётр Петрович");
  assert.equal(firstDirectionWithTwoOriginals.body.applicants[1].averageScore, "4.3");
  assert.equal(firstDirectionWithTwoOriginals.body.applicants[2].fullName, "Сидоров Сидор Сидорович");
  assert.equal(firstDirectionWithTwoOriginals.body.applicants[2].averageScore, "4.8");

  const secondDirectionApplicant = ivanov.body.find((item) => item.specialty === "Вторая специальность");
  const secondDirection = directions.body.find((item) => item.specialty === "Вторая специальность" && item.study_form === "Очная");
  const secondUpdated = await request("/api/admin/applicants/90100000001/original", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ directionId: secondDirectionApplicant.directionId, originalProvided: true })
  });
  assert.equal(secondUpdated.body.updatedDirection, secondDirection.id);
  const firstDirectionIvanov = await request("/api/admin/applicants?q=90100000001", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(firstDirectionIvanov.body.find((item) => item.specialty === "Первая специальность").originalProvided, false);
  assert.equal(firstDirectionIvanov.body.find((item) => item.specialty === "Вторая специальность").originalProvided, true);
  const firstDirectionAfterMove = await request(`/api/admin/directions/${firstDirection.id}/applicants`, {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(firstDirectionAfterMove.body.applicants[0].fullName, "Петров Пётр Петрович");
  assert.equal(firstDirectionAfterMove.body.applicants[0].originalProvided, true);
  assert.equal(firstDirectionAfterMove.body.applicants[1].fullName, "Сидоров Сидор Сидорович");
  assert.equal(firstDirectionAfterMove.body.applicants[2].fullName, "Иванов Иван Иванович");

  const sidorov = await request("/api/admin/applicants?q=Сидоров", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  const priorityUpdated = await request("/api/admin/applicants/90100000003/priority", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ directionId: sidorov.body[0].directionId, priorityEnrollment: true })
  });
  assert.equal(priorityUpdated.body.updatedDirection, firstDirection.id);
  const priorityList = await request(`/api/admin/directions/${firstDirection.id}/applicants`, {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(priorityList.body.applicants[0].fullName, "Петров Пётр Петрович");
  assert.equal(priorityList.body.applicants[0].originalProvided, true);
  assert.equal(priorityList.body.applicants[1].fullName, "Сидоров Сидор Сидорович");
  assert.equal(priorityList.body.applicants[1].averageScore, "4.8");
  assert.equal(priorityList.body.applicants[1].priorityEnrollment, true);
  const publicPriorityList = await request(`/api/directions/${firstDirection.id}/applicants`);
  assert.equal(publicPriorityList.body.applicants[1].averageScore, "первоочередное зачисление");
  assert.equal(publicPriorityList.body.applicants[1].priorityEnrollment, true);
  const prioritySearch = await request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snils: "90100000003" })
  });
  assert.equal(prioritySearch.body.find((item) => item.specialty === "Первая специальность").average_score, "4.8");

  await request("/api/admin/applicants/90100000003/original", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ directionId: sidorov.body[0].directionId, originalProvided: true })
  });
  await request(`/api/admin/directions/${firstDirection.id}/places`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ budgetPlaces: 1, paidPlaces: 5 })
  });

  const exportResponse = await fetch(`${baseUrl}/api/admin/directions/${firstDirection.id}/export-originals`, {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(exportResponse.status, 200);
  assert.match(decodeURIComponent(exportResponse.headers.get("content-disposition")), /Оригиналы_аттестатов_/);
  const exportedWorkbook = new ExcelJS.Workbook();
  await exportedWorkbook.xlsx.load(await exportResponse.arrayBuffer());
  const exportedSheet = exportedWorkbook.getWorksheet("Оригиналы");
  const exportedRows = [
    [exportedSheet.getCell("A1").value || "", exportedSheet.getCell("B1").value || ""],
    [],
    [exportedSheet.getCell("A3").value || "", exportedSheet.getCell("B3").value, exportedSheet.getCell("C3").value],
    [exportedSheet.getCell("A4").value, exportedSheet.getCell("B4").value, exportedSheet.getCell("C4").value],
    exportedSheet.getCell("A5").value ? [exportedSheet.getCell("A5").value] : undefined
  ];
  assert.equal(exportedRows[0][0], "");
  assert.match(exportedRows[0][1], /Первая специальность \(бюджет 1 мест\)/);
  assert.deepEqual(exportedRows[2], ["", "ФИО", "Средний балл"]);
  assert.deepEqual(exportedRows[3], [1, "Сидоров Сидор Сидорович", "Первоочередное зачисление"]);
  assert.deepEqual(exportedRows[4], [2]);
  assert.notEqual(exportedSheet.getCell("B1").alignment.wrapText, true);
  assert.equal(exportedSheet.getCell("C1").isMerged, false);
  assert.ok(exportedSheet.getColumn(2).width >= Math.ceil(String(exportedSheet.getCell("B1").value).length * 1.35));
  assert.equal(exportedSheet.getCell("B3").alignment.horizontal, "center");
  assert.equal(exportedSheet.getCell("B4").alignment.horizontal, "left");
  assert.notEqual(exportedSheet.getCell("B1").fill.fgColor?.argb, "FFD9EAF7");
  assert.notEqual(exportedSheet.getCell("B3").fill.fgColor?.argb, "FFD9EAF7");
  assert.equal(exportedSheet.getCell("A5").fill.fgColor.argb, "FFFFF2CC");
  assert.equal(exportedSheet.getCell("B5").fill.fgColor.argb, "FFFFF2CC");
  assert.equal(exportedSheet.getCell("C5").fill.fgColor.argb, "FFFFF2CC");

  await request(`/api/admin/directions/${firstDirection.id}/places`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.accessToken}` },
    body: JSON.stringify({ budgetPlaces: 0, paidPlaces: 2 })
  });
  const paidOnlyExportResponse = await fetch(`${baseUrl}/api/admin/directions/${firstDirection.id}/export-originals`, {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(paidOnlyExportResponse.status, 200);
  const paidOnlyWorkbook = new ExcelJS.Workbook();
  await paidOnlyWorkbook.xlsx.load(await paidOnlyExportResponse.arrayBuffer());
  const paidOnlySheet = paidOnlyWorkbook.getWorksheet("Оригиналы");
  assert.equal(paidOnlySheet.getCell("A4").fill.fgColor.argb, "FFFFF2CC");
  assert.equal(paidOnlySheet.getCell("B4").fill.fgColor.argb, "FFFFF2CC");
  assert.equal(paidOnlySheet.getCell("C4").fill.fgColor.argb, "FFFFF2CC");
});

test("ищет абитуриентов по части названия и коду специальности", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" })
  });
  const byName = await request("/api/admin/applicants?q=первая", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(byName.body.length, 5);

  const byCode = await request("/api/admin/applicants?q=Вторая", {
    headers: { Authorization: `Bearer ${login.body.accessToken}` }
  });
  assert.equal(byCode.body.length, 1);
  assert.equal(byCode.body[0].specialty, "Вторая специальность");
});
