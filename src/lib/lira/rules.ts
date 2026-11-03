import type { DustSample, XrfReading } from "./types";

/** EPA/HUD/LDEQ action level for lead-based paint by XRF, mg/cm² */
export const XRF_ACTION_LEVEL = 1.0;

export function isCalibration(r: XrfReading): boolean {
  return /calib/i.test(r.locationType);
}

/** A reading is positive when the analyzer flagged it, or (if no flag) Pb ≥ 1.0 mg/cm². */
export function isXrfPositive(r: XrfReading): boolean {
  const flag = r.posNeg.trim().toLowerCase();
  if (flag.startsWith("pos")) return true;
  if (flag.startsWith("neg")) return false;
  return r.pb !== null && r.pb >= XRF_ACTION_LEVEL;
}

/** Positive readings that count as hazards (calibration checks excluded). */
export function positiveHazardReadings(rows: XrfReading[]): XrfReading[] {
  return rows.filter((r) => !isCalibration(r) && isXrfPositive(r));
}

export function xrfSummary(rows: XrfReading[]) {
  const positives = positiveHazardReadings(rows);
  return { total: rows.length, positive: positives.length, positives };
}

/**
 * 2026 EPA Final Rule: any reportable level of lead is a dust-lead hazard.
 * A result below the reporting limit ("<2", "ND", "BRL") is negative; any number is positive.
 */
export function isDustPositive(result: string): boolean {
  const s = result.trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith("<") || s === "nd" || s.includes("brl") || s.includes("not detected")) return false;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0;
}

export function dustHazards(samples: DustSample[]): DustSample[] {
  return samples.filter((s) => isDustPositive(s.result));
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) {
    const rest = n % 100;
    return ONES[Math.floor(n / 100)] + " hundred" + (rest ? " " + numberToWords(rest) : "");
  }
  if (n < 1_000_000) {
    const rest = n % 1000;
    return numberToWords(Math.floor(n / 1000)) + " thousand" + (rest ? " " + numberToWords(rest) : "");
  }
  return String(n);
}

/** "twenty-seven (27)" */
export function countPhrase(n: number): string {
  return `${numberToWords(n)} (${n})`;
}

function isExterior(r: XrfReading) {
  return /exterior/i.test(r.locationType);
}

/** "Location: Exterior Side A Wall Fascia" — used in the hazard control table. */
export function hazardDescription(r: XrfReading): string {
  return `Location: ${[r.locationType, r.room, r.location].filter(Boolean).join(" ")}`;
}

/** Caption fields for a photo of a positive reading (Appendix F). */
export function photoCaption(r: XrfReading) {
  const ext = isExterior(r);
  const sideMatch = r.locationType.match(/side\s*([a-z0-9]+)/i);
  const side = ext ? (sideMatch ? `SIDE ${sideMatch[1].toUpperCase()}` : r.locationType) : r.room;
  let component = r.location;
  if (ext && r.room && !/^wall$/i.test(r.room) && !r.location.toLowerCase().startsWith(r.room.toLowerCase())) {
    component = `${r.room} ${r.location}`;
  }
  return {
    reading: `Reading ${r.test}`,
    lead: r.pb !== null ? `${r.pb} mg/cm²` : "",
    location: ext ? "Exterior" : "Interior",
    side,
    component,
    substrate: r.substrate,
    color: r.color,
  };
}

/** yyyy-mm-dd → "10/1/2026" */
export function formatShortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}
