import type { XrfReading } from "./types";

type Field = keyof XrfReading;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/#]+/g, " ").trim();

// Order matters: more specific matchers claim their column first.
const MATCHERS: [Field, (h: string) => boolean][] = [
  ["posNeg", (h) => /pos\s*\/\s*neg|p\s*\/\s*f|pass|fail|positive|negative|classification/.test(h) || h === "result" || h === "pb result"],
  ["locationType", (h) => h.includes("location type") || h === "side" || h === "area type" || h.includes("calibration") || h.includes("matrix")],
  ["unit", (h) => h.startsWith("unit")],
  ["pb", (h) => /^pb\b|lead|concentration|mg\s*cm/.test(h)],
  ["test", (h) => /^test|^reading|^#$|^no$|^sample/.test(h)],
  ["serial", (h) => h.includes("serial") || h.includes("instrument")],
  ["date", (h) => h.includes("date") || h.includes("time")],
  ["room", (h) => h.includes("room")],
  ["location", (h) => h.includes("location") || h.includes("component") || h.includes("feature")],
  ["substrate", (h) => h.includes("substrate")],
  ["condition", (h) => h.includes("condition")],
  ["color", (h) => h.includes("color") || h.includes("colour")],
];

export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const claimed = new Set<number>();
  const normalized = headers.map((h) => norm(String(h ?? "")));
  for (const [field, test] of MATCHERS) {
    const idx = normalized.findIndex((h, i) => !claimed.has(i) && h !== "" && test(h));
    if (idx >= 0) {
      map[field] = idx;
      claimed.add(idx);
    }
  }
  return map;
}

export function rowsToReadings(table: unknown[][]): {
  readings: XrfReading[];
  missing: Field[];
} {
  const headerIdx = table.findIndex((r) => {
    const m = mapHeaders(r.map((c) => String(c ?? "")));
    return m.pb !== undefined && m.test !== undefined;
  });
  if (headerIdx < 0) return { readings: [], missing: ["pb", "test"] };
  const map = mapHeaders((table[headerIdx] ?? []).map((c) => String(c ?? "")));
  const get = (row: unknown[], f: Field) => {
    const i = map[f];
    return i === undefined ? "" : String(row[i] ?? "").trim();
  };
  const readings: XrfReading[] = [];
  for (const row of table.slice(headerIdx + 1)) {
    const test = get(row, "test");
    const pbRaw = get(row, "pb");
    if (!test && !pbRaw) continue;
    const pbNum = parseFloat(pbRaw.replace(/[^0-9.\-]/g, ""));
    readings.push({
      date: get(row, "date"),
      test,
      serial: get(row, "serial"),
      locationType: get(row, "locationType"),
      room: get(row, "room"),
      location: get(row, "location"),
      pb: Number.isFinite(pbNum) ? pbNum : null,
      ...(Number.isFinite(pbNum) || !pbRaw ? {} : { pbText: pbRaw }),
      posNeg: get(row, "posNeg"),
      unit: get(row, "unit") || "mg/cm2",
      substrate: get(row, "substrate"),
      condition: get(row, "condition"),
      color: get(row, "color"),
    });
  }
  const important: Field[] = ["locationType", "room", "location", "substrate", "condition", "color"];
  return { readings, missing: important.filter((f) => map[f] === undefined) };
}

export async function parseXrfFile(file: File) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  const sheet = first ? wb.Sheets[first] : undefined;
  if (!sheet) return { readings: [], missing: ["pb", "test"] as (keyof XrfReading)[] };
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  return rowsToReadings(table);
}
