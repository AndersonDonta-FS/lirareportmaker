import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, type PDFImage } from "pdf-lib";
import type { ReportData, XrfReading } from "../types";
import {
  countPhrase,
  dustHazards,
  formatShortDate,
  hazardDescription,
  isCalibration,
  isDustPositive,
  isXrfPositive,
  photoCaption,
  xrfSummary,
} from "../rules";
import { COLORS, Layout, PAGE_H, PAGE_W, type Fonts, type Run } from "./layout";
import { fileToJpeg } from "./images";

const ASSET_BASE = "/lira";
const ASSET_FILES = {
  letterhead: "letterhead.pdf",
  fixed: "fixed-pages.pdf",
  signature: "sig-exec.png",
  regular: "fonts/NotoSans-Regular.ttf",
  bold: "fonts/NotoSans-Bold.ttf",
  italic: "fonts/NotoSans-Italic.ttf",
  display: "fonts/Montserrat-Bold.ttf",
  displaySemi: "fonts/Montserrat-SemiBold.ttf",
} as const;
type AssetKey = keyof typeof ASSET_FILES;
let assetCache: Promise<Record<AssetKey, ArrayBuffer>> | null = null;

function loadAssets() {
  if (!assetCache) {
    assetCache = Promise.all(
      (Object.keys(ASSET_FILES) as AssetKey[]).map(async (k) => {
        const r = await fetch(`${ASSET_BASE}/${ASSET_FILES[k]}`);
        if (!r.ok) throw new Error(`Missing report asset ${ASSET_FILES[k]}`);
        return [k, await r.arrayBuffer()] as const;
      }),
    ).then((entries) => Object.fromEntries(entries) as Record<AssetKey, ArrayBuffer>);
    assetCache.catch(() => (assetCache = null));
  }
  return assetCache;
}

// Fixed pages inside fixed-pages.pdf
const FIXED = { pcs: 0, training: 1, ldeq: 2, glossary: 3, resources: 4 };

const UG = "µg/ft²";

export type BuildProgress = (msg: string) => void;

export async function buildReport(data: ReportData, onProgress: BuildProgress = () => {}): Promise<Uint8Array> {
  onProgress("Loading letterhead and fonts…");
  const a = await loadAssets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(a.regular, { subset: true }),
    bold: await doc.embedFont(a.bold, { subset: true }),
    italic: await doc.embedFont(a.italic, { subset: true }),
    display: await doc.embedFont(a.display, { subset: true }),
    displaySemi: await doc.embedFont(a.displaySemi, { subset: true }),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const [letterhead] = await doc.embedPdf(a.letterhead, [0]);
  if (!letterhead) throw new Error("Letterhead page missing");
  const fixedDoc = await PDFDocument.load(a.fixed);
  const signature = await doc.embedPng(a.signature);
  const L = new Layout(doc, fonts, letterhead);

  const addr = data.address.trim() || "—";
  const csz = data.cityStateZip.trim();
  const inspected = formatShortDate(data.inspectionDate);
  const reported = formatShortDate(data.reportDate);
  const A = data.assessor;
  const xrf = xrfSummary(data.xrf);
  const hazards = dustHazards(data.dust);
  const lbpPositive = data.headline === "auto" ? xrf.positive > 0 : data.headline === "positive";
  const toc: Record<string, number> = {};

  doc.setTitle(`LIRA – ${addr}`);
  doc.setAuthor(A.name);
  doc.setSubject("Lead Based Paint Inspection and Lead Hazard Risk Assessment Report");

  const drawSignature = () => {
    L.ensure(60);
    const w = 130;
    const h = (signature.height / signature.width) * w;
    L.page.drawImage(signature, { x: L.left - 4, y: L.y - h, width: w, height: h });
    L.y -= h + 2;
  };

  // ---------- 1. Cover ----------
  onProgress("Building cover and letters…");
  L.newPage();
  {
    const title = L.wrapPlain("Lead Based Paint Inspection and Lead Hazard Risk Assessment Report", fonts.bold, 19, 400);
    let y = 668;
    for (const t of title) {
      L.centeredText(t, y, 19, fonts.bold);
      y -= 26;
    }
    const boxW = 468;
    const boxH = 230;
    const boxTop = y - 8;
    if (data.coverPhoto) {
      const img = await fileToJpeg(data.coverPhoto, { maxDim: 1800, aspect: boxW / boxH });
      const emb = await doc.embedJpg(img.bytes);
      L.page.drawImage(emb, { x: (PAGE_W - boxW) / 2, y: boxTop - boxH, width: boxW, height: boxH });
    }
    const lines: string[] = [
      "Performed at:",
      addr,
      csz,
      "Prepared By:",
      A.name,
      "City of Monroe: Planning & Urban Development",
      `Lead Inspector Certification: #${A.inspectorCert}`,
      `Risk Assessor Certification: #${A.riskAssessorCert}`,
      "1401 Stubbs Avenue",
      "Monroe, Louisiana 71201",
      "318-329-2256",
    ].filter(Boolean);
    let ly = 330;
    for (const ln of lines) {
      L.centeredText(ln, ly, 11.5, fonts.bold);
      ly -= 17;
    }
  }

  // ---------- 2. Result headline ----------
  L.newPage();
  L.centeredText(
    lbpPositive ? "Positive: Lead-Based Paint" : "Negative: Lead-Based Paint",
    PAGE_H / 2 - 12,
    32,
    fonts.serifBold,
    lbpPositive ? COLORS.red : COLORS.text,
  );

  // ---------- 3. Executive Summary ----------
  L.newPage();
  L.heading("Executive Summary", { size: 15, font: fonts.regular, align: "center", spaceBefore: 0, spaceAfter: 26 });
  L.paragraph("To Whom It May Concern:", { spaceAfter: 2 });
  const dustAny = hazards.length > 0;
  const finding =
    lbpPositive && dustAny
      ? "The assessment revealed the presence of lead-based paint and active lead dust hazards on the property as of the date of the inspection."
      : lbpPositive
        ? "The assessment revealed the presence of lead-based paint on the property; no active lead dust hazards were identified as of the date of the inspection."
        : dustAny
          ? "The assessment revealed active lead dust hazards on the property; no lead-based paint was identified as of the date of the inspection."
          : "The assessment did not reveal the presence of lead-based paint or active lead dust hazards on the property as of the date of the inspection.";
  L.paragraph(
    [
      { text: `This letter serves to inform you of the findings from a lead-based paint inspection and lead hazard risk assessment conducted by Risk Assessor ${A.name} on ${inspected}, at ` },
      { text: addr, bold: true },
      { text: `${csz ? ", " + csz : ""}. ${finding}` },
    ],
    { spaceAfter: 2 },
  );
  L.paragraph(
    "The analytical results identified the following lead-based paint (LBP) and lead dust hazards, in accordance with the standards set by the Environmental Protection Agency (EPA) and the Louisiana Department of Environmental Quality (LDEQ):",
    { spaceAfter: 2 },
  );
  L.paragraph(
    [
      { text: "Lead-Based Paint (XRF):", bold: true },
      { text: " Out of " },
      { text: countPhrase(xrf.total), bold: true },
      { text: " X-ray fluorescence (XRF) readings taken from the residence, " },
      xrf.positive > 0
        ? { text: countPhrase(xrf.positive), bold: true, color: COLORS.red }
        : { text: "none (0)", bold: true },
      { text: ` reading${xrf.positive === 1 ? "" : "s"} tested positive for lead levels that meet or exceed the regulatory threshold for concern (greater than or equal to 1.0 milligram per square centimeter [≥ 1.0 mg/cm²]).` },
    ],
    { bullet: true, indent: 18, spaceAfter: 2 },
  );
  const dustRuns: Run[] = [
    { text: "Lead Dust Hazards:", bold: true },
    { text: " In accordance with the " },
    { text: "2026 EPA Final Rule", bold: true },
    { text: ", which establishes a dust-lead hazard for any reportable level of lead, laboratory analysis identified " },
  ];
  if (!dustAny) {
    dustRuns.push({ text: "no active dust-lead hazards", bold: true }, { text: "; all dust wipe samples were below the laboratory reporting limit." });
  } else {
    dustRuns.push(
      { text: countPhrase(hazards.length), bold: true, color: COLORS.red },
      { text: ` active dust-lead hazard${hazards.length === 1 ? "" : "s"}. ` },
    );
    hazards.forEach((h, i) => {
      const desc = [h.location, h.surface].filter(Boolean).join(" ");
      if (i > 0) dustRuns.push({ text: i === hazards.length - 1 ? " and " : ", " });
      dustRuns.push(
        { text: `Sample ID #${h.id} (`, color: COLORS.red },
        { text: desc, bold: true, color: COLORS.red },
        { text: ")", color: COLORS.red },
        { text: i === 0 ? " registered an elevated level of " : " registered " },
        { text: `${h.result.replace(/[^0-9.<]/g, "")} ${UG}`, bold: true, color: COLORS.red },
      );
    });
    dustRuns.push({ text: "." });
  }
  L.paragraph(dustRuns, { bullet: true, indent: 18, spaceAfter: 2 });
  L.paragraph(
    lbpPositive || dustAny
      ? "All identified lead-based paint components and lead dust hazards must be addressed by EPA-certified lead abatement contractors and trained professionals using lead-safe work practices."
      : "No lead-based paint hazard control activities are required at this time based on these findings.",
    { spaceAfter: 10 },
  );
  L.page.drawLine({ start: { x: L.left, y: L.y }, end: { x: L.right, y: L.y }, thickness: 0.6, color: COLORS.rule });
  L.space(22);
  L.paragraph("Thank you for your attention to this matter.", { spaceAfter: 12 });
  L.paragraph("Sincerely,", { spaceAfter: 8 });
  drawSignature();
  L.paragraph("Planning & Urban Development", { spaceAfter: 0 });
  L.paragraph(A.fullName, { spaceAfter: 0 });
  L.paragraph(`Risk Assessor, (LDEQ #${A.inspectorCert} /#${A.riskAssessorCert})`, { spaceAfter: 0 });

  // ---------- 4. Letter to the Owner ----------
  L.newPage();
  L.paragraph("City of Monroe: Planning & Urban Development", { spaceAfter: 14 });
  L.heading("Letter to the Owner", { size: 14, font: fonts.regular, align: "center", spaceBefore: 0, spaceAfter: 30 });
  L.paragraph(reported, { spaceAfter: 0 });
  L.paragraph(data.ownerName || "Property Owner", { spaceAfter: 0 });
  L.paragraph(addr, { spaceAfter: 0 });
  L.paragraph(csz, { spaceAfter: 16 });
  L.paragraph(`Dear ${data.ownerName || "Property Owner"},`, { spaceAfter: 12 });
  L.paragraph(
    `The lead-based paint inspection was performed on ${inspected} to identify areas with potential lead paint. The risk assessment identifies housing conditions called lead hazards that could harm residents, workers, and young children. This report will inform the owner of any hazards and their locations.`,
    { spaceAfter: 12 },
  );
  L.paragraph("Please refer to the XRF results page and the dust wipe results for the location of any hazards found.", { spaceAfter: 22 });
  L.paragraph("Sincerely,", { spaceAfter: 8 });
  drawSignature();
  L.paragraph(A.fullName, { spaceAfter: 0 });
  L.paragraph(`Risk Assessor, (LDEQ# ${A.riskAssessorCert})`, { spaceAfter: 0 });
  L.paragraph("City Of Monroe: Planning & Urban Development", { spaceAfter: 0 });

  // ---------- 5. TOC (filled in at the end) ----------
  const tocPage = L.newPage();

  // ---------- 6. Appendices list ----------
  L.newPage();
  L.page.drawText("APPENDICES", { x: L.left, y: L.y - 28, size: 26, font: fonts.display });
  L.y -= 70;
  const appendices = [
    "Appendix A- Lead-based Paint XRF Results",
    "Appendix B- Laboratory Analytical Results",
    "Appendix C- XRF Performance Characteristics Sheet",
    "Appendix D- Site Drawing",
    "Appendix E- Certification",
    "Appendix F- Photos of Located Lead",
    "Appendix G- Lead Safety Glossary",
    "Appendix H- Additional Resources",
  ];
  for (const ap of appendices) L.paragraph(ap, { spaceAfter: 22 });

  // ---------- 7+. Narrative ----------
  L.newPage();
  const H = (t: string, key?: string) => {
    L.heading(t, { size: 11, color: COLORS.heading, spaceBefore: 8, spaceAfter: 4 });
    if (key) toc[key] = L.pageNumber;
  };
  H("Introduction", "Introduction");
  L.paragraph(
    `The City of Monroe presents this report on the lead-based paint inspection and risk assessment conducted at ${addr}. Our report presents the information, inspection, risk assessment, visual observations, LBP testing procedures and results, dust sampling methods and results, and conclusions and recommendations.`,
  );
  H("Project Objectives", "Project Objectives");
  L.paragraph(
    "The service aims to identify painted or otherwise coated surfaces with concentrations of lead that exceed the regulatory level, evaluate the property's existing or potential health hazards associated with lead-based paint, and provide recommendations for remediation of health hazards.",
  );
  L.paragraph(
    "This service followed chapters 5 and 7 of the U.S. Department of Housing and Urban Development Guidelines for the Evaluation and Control of Lead-Based Paint Hazards (HUD) Guidelines second edition and Louisiana Environmental Regulatory Code (ERC) Title 33, part 3, chapter 28.",
  );
  H("Regulatory Overview", "Regulatory Overview");
  L.paragraph(
    "In 1978, the Consumer Product Safety Commission banned the sale of lead-based paint to consumers, and its application to areas where consumers with direct access to painted surfaces. As a result of this ban, buildings painted before 1978 are suspected of containing lead paint.",
  );
  L.paragraph(
    "The U.S. Environmental Protection Agency and HUD have specific guidelines for assessing lead-based paint hazards. The 2012 HUD Guidelines provide the template for the Evaluation and Control of Lead-Based Hazards in Housing in Chapters 5 and 7 reference the risk assessment process. This set of guidelines is issued under Section 1017 of the Residential Lead-Based Paint Hazard Reduction Act of 1992 and is referred to as Title X. It was enacted as Title X of the Housing and Community Development Act of 1992 (Public Law 102-550). The guidelines are based on the concepts, definitions, and requirements set forth by Congress in Title X. Section 1017 requires the HUD Secretary to issue Guidelines for the conduct of federally supported work involving risk assessments, inspections, interim controls, and the permanent removal of lead-based paint hazards.",
  );
  L.paragraph(
    "The EPA/HUD and Louisiana Administrative Code 33:111. 2803 defines lead-based paint surfaces containing 1.0 milligrams per square centimeter (1.0 mg/cm²) of surface area by the X-ray-fluorescence analyzer method, or 0.5% lead dry weight using the atomic absorption analytical method.",
  );
  H("Property Descriptions", "Property Description");
  L.space(4);
  const propRows: [string, Run][] = [
    ["Property Address", { text: addr, bold: true }],
    ["Current Owner", { text: data.ownerName }],
    ["Owner Phone", { text: data.ownerPhone }],
    ["House Type", { text: data.houseType }],
  ];
  for (const [label, val] of propRows) {
    L.ensure(24);
    L.page.drawText(label, { x: L.left, y: L.y - 11, size: 11, font: fonts.regular });
    L.page.drawText(val.text || "—", { x: L.left + 120, y: L.y - 11, size: 11, font: val.bold ? fonts.bold : fonts.regular });
    L.y -= 26;
  }

  H("Sampling, Testing, and Analysis", "Sampling, Testing, and Analysis");
  L.paragraph([{ text: "Dust Wipes", bold: true }], { bullet: true, indent: 18 });
  L.paragraph([
    { text: "Dust wipe samples were collected in accordance with " },
    { text: "HUD Guidelines, Appendix 13.1", bold: true },
    { text: ". Samples were collected using wipes that meet " },
    { text: "ASTM Standard E1792", bold: true },
    { text: " and submitted for analysis via " },
    { text: "Flame Atomic Absorption Spectroscopy", bold: true },
    { text: " at a laboratory accredited by the Environmental Lead Laboratory Accreditation Program (ELLAP) and the Louisiana Environmental Lab Accreditation Program (LELAP)." },
  ]);
  L.paragraph([{ text: "Result Parameters (Effective 2026)", bold: true }], { spaceAfter: 0 });
  L.paragraph([
    { text: "In accordance with the 2026 EPA final rule, the threshold for a " },
    { text: "Dust-Lead Hazard", bold: true },
    { text: " has been updated from a fixed numeric value to " },
    { text: 'any "reportable level"', bold: true },
    { text: " of lead as determined by an accredited laboratory." },
  ]);
  L.paragraph([
    { text: "For the purposes of " },
    { text: "Post-Abatement Clearance (DLCL)", bold: true },
    { text: ", the following strict numeric action levels now apply:" },
  ]);
  L.paragraph([{ text: "Floors:", bold: true }, { text: " 5 µg/ft²" }], { bullet: true, indent: 18, spaceAfter: 4 });
  L.paragraph([{ text: "Window Sills:", bold: true }, { text: " 40 µg/ft²" }], { bullet: true, indent: 18, spaceAfter: 4 });
  L.paragraph([{ text: "Window Troughs:", bold: true }, { text: " 100 µg/ft²" }], { bullet: true, indent: 18 });

  H("Dust Wipe Findings", "Dust Wipe Findings");
  const dustRows = data.dust.length
    ? data.dust.map((d) => [d.id, d.location, d.surface, d.result, isDustPositive(d.result) ? "Positive" : "Negative"])
    : [["N/A", "No dust wipe samples", "", "", ""]];
  L.table({
    columns: [
      { header: "Sample ID", width: 60, align: "center" },
      { header: "Room", width: 150, align: "center" },
      { header: "Surface", width: 80, align: "center" },
      { header: `Lab Result ${UG}`, width: 90, align: "center" },
      { header: "Lead Present", width: 88, align: "center" },
    ],
    rows: dustRows,
    size: 9,
    headerBold: false,
    rowStyle: (i) => (data.dust[i] && isDustPositive(data.dust[i].result) ? { color: COLORS.red } : undefined),
  });
  L.space(14);

  L.paragraph([{ text: "Soil Samples", bold: true }], { bullet: true, indent: 18 });
  L.table({
    columns: [
      { header: "Sample ID", width: 120 },
      { header: "Area", width: 200 },
      { header: "Results", width: 148 },
    ],
    rows: data.soil.length ? data.soil.map((s) => [s.id, s.area, s.result]) : [["N/A", "N/A", "N/A"]],
    size: 9,
    headerBold: false,
    borders: false,
  });
  L.space(10);
  L.paragraph([{ text: "Soil Sampling Comments", bold: true }], { bullet: true, indent: 18 });
  L.paragraph(data.soilComment || "No Soil samples were Collected.", { indent: 18 });

  L.paragraph([{ text: "XRF Lead-Based Paint Testing", bold: true }], { bullet: true, indent: 18 });
  L.paragraph(
    "The Sci-apps-550 device was used to evaluate the structure surface by surface. Machine calibrations were performed at the beginning and end of the assessment. Measurements were taken of each room or equivalent in the home and outdoors. Based on the location of the front door, the direction of the XRF readings is identified as A, B, C, and D. The same method was used on the home's exterior.",
    { align: "justify" },
  );
  L.paragraph([{ text: "Disclosure Obligations", bold: true }], { bullet: true, indent: 18 });
  L.paragraph(
    "The Lead-Based Paint Inspection and Risk Assessment results must be provided to new lessees and prospective buyers of this property under federal Law (24 CFR Part 35 and 40 CFR Part 745) before they become obligated under a lease or sales contract. The complete report is to be provided to the owners and prospective buyers to be available for all prospective tenants, and renewing tenants if they have not been provided with the information. The risk assessor's plain language summary of this report must be provided to the client upon completion. The landlord or seller must distribute an educational pamphlet approved by the U.S. Environmental Protection Agency and include that parents have the information they need to protect their children from lead-based paint hazards. Complete disclosure requires the landlord/sellers and renters/buyers to sign and date acknowledgment that the information and materials were provided and received. Also, prospective buyers must have the opportunity to have their lead-based paint inspection, lead hazard screen, and or risk assessment performed before the purchase agreement is signed. The standard period is 10 days, but this period may be changed or waived by the agreement between the seller and prospective buyer. EPA regulations require the risk assessor to keep the risk assessment report for at least 3 years.",
    { align: "justify" },
  );
  H("General Comments", "General Comments");
  for (const t of [
    "This Lead-based Paint Inspection and Risk Assessment was conducted in a way that is consistent with other professionals in this field. The results, findings, conclusions, and recommendations covered in this report are based on conditions observed during our assessment. The information in this report is relevant to the dates on which this assessment was performed and should not be relied upon to request conditions later.",
    "This report has been prepared for the City of Monroe for our use on each project.",
    "This report will be given to the homeowner once the project is complete.",
    "Contractors, Consultants, or others viewing this report must draw their conclusions on further investigations or remediation are necessary.",
    "The City of Monroe does not guarantee the work from a third-party testing laboratory or other parties supplying information that may have been used in this report.",
  ])
    L.paragraph(t, { align: "justify" });

  // ---------- Appendix dividers ----------
  const divider = (letter: string, title: string) => {
    L.newPage();
    L.centeredText(`Appendix ${letter}`, 470, 34, fonts.display);
    const lines = L.wrapPlain(title, fonts.display, 30, 400);
    let y = 410;
    for (const ln of lines) {
      L.centeredText(ln, y, 30, fonts.display);
      y -= 44;
    }
  };

  // ---------- Appendix A: XRF ----------
  onProgress("Laying out XRF readings…");
  divider("A", "Lead-Based Paint Test Results.");
  L.page.drawText("XRF Results", { x: L.left, y: 70, size: 10, font: fonts.bold, color: COLORS.heading });
  L.newPage();
  toc["XRF Results"] = L.pageNumber;
  L.page.drawText("XRF MANUFACTURER AND MODEL:", { x: L.left, y: L.y - 10, size: 9.5, font: fonts.bold });
  L.page.drawText("Make:", { x: L.left, y: L.y - 23, size: 9.5, font: fonts.bold });
  L.page.drawText("SciAps", { x: L.left + 34, y: L.y - 23, size: 9.5, font: fonts.italic });
  L.page.drawText("Models:", { x: L.left, y: L.y - 36, size: 9.5, font: fonts.bold });
  L.page.drawText("Model X-550", { x: L.left + 42, y: L.y - 36, size: 9.5, font: fonts.italic });
  L.y -= 52;
  L.table({
    x: 24,
    columns: [
      { header: "Date", width: 48, align: "center" },
      { header: "Test #", width: 26, align: "center" },
      { header: "Serial #", width: 56, align: "center" },
      { header: "Location Type", width: 70, align: "center" },
      { header: "Room", width: 48, align: "center" },
      { header: "Location", width: 54, align: "center" },
      { header: "Pb", width: 26, align: "center" },
      { header: "Pb Pos/Neg", width: 46, align: "center" },
      { header: "Unit Type", width: 40, align: "center" },
      { header: "Substrate", width: 46, align: "center" },
      { header: "Condition", width: 54, align: "center" },
      { header: "Color", width: 50, align: "center" },
    ],
    rows: data.xrf.map((r) => [
      r.date,
      r.test,
      r.serial,
      r.locationType,
      r.room,
      r.location,
      r.pb === null ? "" : String(r.pb),
      r.posNeg || (isXrfPositive(r) ? "Positive" : "Negative"),
      r.unit,
      r.substrate,
      r.condition,
      r.color,
    ]),
    size: 7.5,
    pad: 2,
    headerBold: false,
    rowStyle: (i) => {
      const r = data.xrf[i];
      if (!r) return undefined;
      if (isCalibration(r)) return { fill: COLORS.rowYellow };
      if (isXrfPositive(r)) return { fill: COLORS.rowRed };
      return undefined;
    },
  });

  // Hazard control summary
  L.newPage();
  L.heading("Summary of Lead-Based Paint Hazard Control Options", { size: 11, spaceBefore: 30, spaceAfter: 2 });
  L.paragraph(
    "The table below outlines the identified lead-based paint hazards mapped directly to their corresponding XRF test numbers, alongside the regulatory-approved control measures for each positive location. Per HUD Guidelines and EPA regulations, two primary hazard management approaches are presented for each identified hazard:",
    { align: "justify", spaceAfter: 2 },
  );
  L.paragraph(
    [
      { text: "Interim Controls:", bold: true },
      { text: " Temporary, short-term measures designed to immediately address paint hazards and reduce exposure risk. These focus primarily on " },
      { text: "paint stabilization", bold: true },
      { text: "—which involves safe wet scraping, priming, recoating with lead-safe sealant or durable exterior/interior paint, and specialized HEPA cleaning. Interim controls require ongoing monitoring and maintenance to ensure the paint film remains intact." },
    ],
    { bullet: true, indent: 18, align: "justify", spaceAfter: 2 },
  );
  L.paragraph(
    [
      { text: "Long-Term Controls (Abatement):", bold: true },
      { text: " Permanent solutions designed to eliminate lead hazards for at least 20 years. These measures include the complete " },
      { text: "removal of lead-based paint", bold: true },
      { text: " (off-site or chemical stripping), total " },
      { text: "replacement of components", bold: true },
      { text: " (such as replacing windows, doors, or trim with lead-free materials), or complete " },
      { text: "enclosure", bold: true },
      { text: " using heavy-duty cladding, capping, or building materials." },
    ],
    { bullet: true, indent: 18, align: "justify", spaceAfter: 2 },
  );
  L.paragraph(
    "Property owners may choose between implementing interim controls—paired with a routine visual maintenance plan—or pursuing permanent long-term abatement options. All stabilization and removal activities must be performed by EPA-certified Lead-Safe or Lead Abatement Contractors using proper containment, safe work practices, and post-remediation clearance testing.",
    { align: "justify", spaceAfter: 2 },
  );
  L.paragraph(
    [
      { text: "This table excludes calibration tests and " },
      { text: "only includes findings where Lead (Pb) was identified as Positive", bold: true },
      { text: "." },
    ],
    { align: "justify", spaceAfter: 18 },
  );
  if (xrf.positives.length) {
    L.table({
      columns: [
        { header: "Test Number", width: 62 },
        { header: "Hazard Identified", width: 166 },
        { header: "Interim Control Option", width: 100 },
        { header: "Long Term Control Option", width: 140 },
      ],
      rows: xrf.positives.map((r) => [`Reading ${r.test}`, hazardDescription(r), "Paint stabilization", "Removal of LBP or replacement of component"]),
      size: 10,
      pad: 5,
      valign: "top",
    });
  } else {
    L.paragraph([{ text: "No positive XRF readings were identified. No lead-based paint hazard control measures are required.", bold: true }]);
  }

  // ---------- Appendix B: Lab ----------
  onProgress("Adding lab report…");
  divider("B", "Laboratory Results");
  if (data.labPdf) {
    const labDoc = await PDFDocument.load(await data.labPdf.arrayBuffer(), { ignoreEncryption: true });
    const indices = labDoc.getPageIndices();
    const embedded = await doc.embedPdf(labDoc, indices);
    for (const ep of embedded) {
      L.newPage();
      const areaW = PAGE_W - 72;
      const areaH = 700 - 40;
      const s = Math.min(areaW / ep.width, areaH / ep.height);
      const w = ep.width * s;
      const h = ep.height * s;
      L.page.drawPage(ep, { x: (PAGE_W - w) / 2, y: 40 + (areaH - h) / 2, width: w, height: h });
    }
  }

  // ---------- Appendix C: PCS ----------
  divider("C", "XRF PCS Sheet");
  const copyFixed = async (idx: number) => {
    const [p] = await doc.copyPages(fixedDoc, [idx]);
    if (p) doc.addPage(p);
  };
  await copyFixed(FIXED.pcs);

  // ---------- Appendix D: Site drawing ----------
  divider("D", "Site Drawing");
  if (data.siteDrawing) {
    onProgress("Adding site drawing…");
    L.newPage();
    const img = await fileToJpeg(data.siteDrawing, { maxDim: 2200, quality: 0.9 });
    const emb = await doc.embedJpg(img.bytes);
    const areaW = PAGE_W - 120;
    const areaH = 560;
    const s = Math.min(areaW / emb.width, areaH / emb.height);
    const w = emb.width * s;
    const h = emb.height * s;
    const top = 680;
    L.page.drawImage(emb, { x: (PAGE_W - w) / 2, y: top - h, width: w, height: h });
    L.centeredText(addr, top - h - 26, 13, fonts.bold);
  }

  // ---------- Appendix E: Certifications ----------
  divider("E", "Certifications");
  await copyFixed(FIXED.training);
  await copyFixed(FIXED.ldeq);

  // ---------- Appendix F: Photos ----------
  divider("F", "Photos of Located Lead");
  const byTest = new Map<string, XrfReading>(data.xrf.map((r) => [r.test, r]));
  const photos = [...data.photos].sort((a, b) => (parseFloat(a.reading) || 0) - (parseFloat(b.reading) || 0));
  const slotH = 216;
  for (let i = 0; i < photos.length; i++) {
    if (i % 3 === 0) L.newPage();
    onProgress(`Adding photo ${i + 1} of ${photos.length}…`);
    const p = photos[i];
    if (!p) continue;
    const top = 700 - (i % 3) * slotH;
    let emb: PDFImage;
    try {
      const img = await fileToJpeg(p.file, { maxDim: 1200 });
      emb = await doc.embedJpg(img.bytes);
    } catch {
      continue;
    }
    const boxW = 160;
    const boxH = 200;
    const s = Math.min(boxW / emb.width, boxH / emb.height);
    const w = emb.width * s;
    const h = emb.height * s;
    L.page.drawImage(emb, { x: 86 + (boxW - w) / 2, y: top - h, width: w, height: h });
    const r = byTest.get(p.reading);
    const cap = r
      ? photoCaption(r)
      : { reading: `Reading ${p.reading}`, lead: "", location: "", side: "", component: "", substrate: "", color: "" };
    const lines = [
      cap.reading,
      cap.lead && `Lead: ${cap.lead}`,
      cap.location && `Location: ${cap.location}`,
      cap.side && `Side: ${cap.side}`,
      cap.component && `Component: ${cap.component}`,
      cap.substrate && `Substrate: ${cap.substrate}`,
      cap.color && `Color: ${cap.color}`,
    ].filter(Boolean) as string[];
    lines.forEach((ln, li) => {
      L.page.drawText(ln, { x: 290, y: top - 11 - li * 16, size: 10.5, font: fonts.regular });
    });
  }

  // ---------- Appendix G / H ----------
  divider("G", "Lead Safety Glossary");
  await copyFixed(FIXED.glossary);
  divider("H", "Additional Resources");
  await copyFixed(FIXED.resources);

  // ---------- TOC ----------
  {
    const p = tocPage;
    p.drawText("Table of Contents", { x: 72, y: 640, size: 26, font: fonts.display });
    const entries: [string, string][] = [
      ["Introduction", "Introduction"],
      ["Project Objectives", "Project Objectives"],
      ["Regulatory Overview", "Regulatory Overview"],
      ["Property Description", "Property Description"],
      ["Sampling, Testing, and Analysis", "Sampling, Testing, and Analysis"],
      ["Dust Wipe Findings", "Dust Wipe Findings"],
      ["General Comments", "General Comments"],
      ["XRF Results", "XRF Results"],
    ];
    let y = 580;
    const size = 11;
    const dotW = fonts.regular.widthOfTextAtSize(".", size);
    for (const [label, key] of entries) {
      const num = String(toc[key] ?? "");
      const lw = fonts.regular.widthOfTextAtSize(label, size);
      const nw = fonts.regular.widthOfTextAtSize(num, size);
      p.drawText(label, { x: 72, y, size, font: fonts.regular });
      p.drawText(num, { x: 540 - nw, y, size, font: fonts.regular });
      const start = 72 + lw + 4;
      const end = 540 - nw - 4;
      const dots = Math.max(0, Math.floor((end - start) / dotW));
      p.drawText(".".repeat(dots), { x: end - dots * dotW, y, size, font: fonts.regular });
      y -= 38;
    }
  }

  // ---------- Page numbers ----------
  doc.getPages().forEach((p, i) => {
    const t = String(i + 1);
    const w = fonts.regular.widthOfTextAtSize(t, 10.5);
    p.drawText(t, { x: (PAGE_W - w) / 2, y: 18, size: 10.5, font: fonts.regular });
  });

  onProgress("Saving PDF…");
  return doc.save();
}
