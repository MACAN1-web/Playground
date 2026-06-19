import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);

const sourcePath = "/Users/vladluckin/Downloads/Оригиналы_аттестатов_15_08_2025_точный.xlsx";
const outputDir = path.resolve("test-files");
const outputPath = path.join(outputDir, "Тестовый_рейтинг_ИСП_АТ_с_вымышленными_СНИЛС.xlsx");
const selectedSheets = ["ИСП", "АТ "];

const workbook = XLSX.readFile(sourcePath, { cellStyles: true });
const result = XLSX.utils.book_new();

selectedSheets.forEach((sheetName, sheetIndex) => {
  const sourceSheet = workbook.Sheets[sheetName];
  const sheet = structuredClone(sourceSheet);
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  sheet.D2 = {
    t: "s",
    v: "СНИЛС",
    s: structuredClone(sheet.C2?.s ?? sheet.B2?.s ?? {})
  };

  for (let row = 2; row <= range.e.r; row += 1) {
    const positionCell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const position = Number(positionCell?.v);
    if (!Number.isInteger(position)) continue;

    const fakeSnils = `9${String(sheetIndex + 1).padStart(2, "0")}${String(position).padStart(8, "0")}`;
    const styleSource =
      sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]?.s ??
      sheet[XLSX.utils.encode_cell({ r: row, c: 2 })]?.s ??
      {};

    sheet[XLSX.utils.encode_cell({ r: row, c: 3 })] = {
      t: "s",
      v: fakeSnils,
      s: structuredClone(styleSource)
    };
  }

  range.e.c = Math.max(range.e.c, 3);
  sheet["!ref"] = XLSX.utils.encode_range(range);
  sheet["!cols"] = [...(sheet["!cols"] ?? []), { wch: 18 }];
  XLSX.utils.book_append_sheet(result, sheet, sheetName.trim());
});

fs.mkdirSync(outputDir, { recursive: true });
XLSX.writeFile(result, outputPath, { cellStyles: true });
console.log(outputPath);
