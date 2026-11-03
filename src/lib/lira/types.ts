export type XrfReading = {
  date: string;
  test: string;
  serial: string;
  locationType: string;
  room: string;
  location: string;
  pb: number | null;
  posNeg: string;
  unit: string;
  substrate: string;
  condition: string;
  color: string;
};

export type DustSample = {
  id: string;
  location: string;
  surface: string;
  /** Lab result as printed, e.g. "<2" or "2.9" (µg/ft²) */
  result: string;
};

export type SoilSample = {
  id: string;
  area: string;
  result: string;
};

export type PhotoEntry = {
  id: string;
  file: File;
  /** XRF test number this photo documents */
  reading: string;
};

export type AssessorInfo = {
  name: string; // "Donta Anderson"
  fullName: string; // "Donta K. Anderson"
  inspectorCert: string; // "DI249483"
  riskAssessorCert: string; // "DR249483"
};

export type ResultHeadline = "auto" | "positive" | "negative";

export type ReportData = {
  address: string;
  cityStateZip: string;
  ownerName: string;
  ownerPhone: string;
  houseType: string;
  inspectionDate: string; // yyyy-mm-dd
  reportDate: string; // yyyy-mm-dd
  assessor: AssessorInfo;
  headline: ResultHeadline;
  coverPhoto: File | null;
  xrf: XrfReading[];
  dust: DustSample[];
  soil: SoilSample[];
  soilComment: string;
  labPdf: File | null;
  siteDrawing: File | null;
  photos: PhotoEntry[];
};
