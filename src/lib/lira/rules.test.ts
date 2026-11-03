import { describe, expect, it } from "vitest";
import {
  countPhrase,
  hazardDescription,
  isDustPositive,
  isXrfPositive,
  photoCaption,
  xrfSummary,
} from "./rules";
import { mapHeaders, rowsToReadings } from "./xrf-import";
import type { XrfReading } from "./types";

const r = (p: Partial<XrfReading>): XrfReading => ({
  date: "10/1/2026", test: "1", serial: "X550", locationType: "Interior", room: "Bed 2",
  location: "Door", pb: 0, posNeg: "", unit: "mg/cm2", substrate: "Wood", condition: "Intact", color: "White",
  ...p,
});

describe("XRF rules", () => {
  it("1.0 mg/cm² is positive, 0.99 is negative when no flag is given", () => {
    expect(isXrfPositive(r({ pb: 1.0 }))).toBe(true);
    expect(isXrfPositive(r({ pb: 0.99 }))).toBe(false);
  });

  it("total counts every reading; positives exclude calibration checks", () => {
    const rows = [
      r({ test: "1", locationType: "CALIBRATION", pb: 1.06, posNeg: "Positive" }),
      r({ test: "2", pb: 2.4, posNeg: "Positive" }),
      r({ test: "3", pb: 0.1, posNeg: "Negative" }),
    ];
    const s = xrfSummary(rows);
    expect(s.total).toBe(3);
    expect(s.positive).toBe(1);
    expect(s.positives[0].test).toBe("2");
  });
});

describe("dust rules (2026 EPA: any reportable level is a hazard)", () => {
  it("below reporting limit is negative", () => {
    expect(isDustPositive("<2")).toBe(false);
    expect(isDustPositive("<2.0 µg/ft²")).toBe(false);
  });
  it("any reported number is positive", () => {
    expect(isDustPositive("2.9")).toBe(true);
  });
});

describe("wording", () => {
  it("writes counts the way the report does", () => {
    expect(countPhrase(216)).toBe("two hundred sixteen (216)");
    expect(countPhrase(27)).toBe("twenty-seven (27)");
  });
  it("builds hazard and photo text from a reading", () => {
    const ext = r({ test: "17", locationType: "Exterior Side A", room: "Wall", location: "Fascia", pb: 3.21 });
    expect(hazardDescription(ext)).toBe("Location: Exterior Side A Wall Fascia");
    expect(photoCaption(ext).side).toBe("SIDE A");
    expect(photoCaption(ext).component).toBe("Fascia");
    const door = r({ locationType: "Exterior Side A", room: "Door", location: "Casing" });
    expect(photoCaption(door).component).toBe("Door Casing");
    const int = r({ room: "Bed 2", location: "Window Casing" });
    expect(photoCaption(int).side).toBe("Bed 2");
  });
});

describe("XRF file import", () => {
  it("maps the SciAps column headers", () => {
    const m = mapHeaders(["Date", "Test #", "Serial #", "Location Type", "Room", "Location", "Pb", "Pb Pos/Neg", "Unit Type", "Substrate", "Condition", "Color"]);
    expect(m).toMatchObject({ date: 0, test: 1, serial: 2, locationType: 3, room: 4, location: 5, pb: 6, posNeg: 7, unit: 8 });
  });
  it("reads rows under the header", () => {
    const { readings } = rowsToReadings([
      ["Test #", "Pb", "Pb Pos/Neg", "Location Type"],
      ["17", "3.21", "Positive", "Exterior Side A"],
      ["", "", "", ""],
    ]);
    expect(readings).toHaveLength(1);
    expect(readings[0].pb).toBe(3.21);
  });
});
