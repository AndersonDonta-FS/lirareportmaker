import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Download, ExternalLink, FileDown, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusPill } from "@/components/lira/Section";
import { XrfSection } from "@/components/lira/XrfSection";
import { LabSection } from "@/components/lira/LabSection";
import { MediaSection } from "@/components/lira/MediaSection";
import { CredentialsUpload } from "@/components/lira/CredentialsUpload";
import { dustHazards, xrfSummary } from "@/lib/lira/rules";
import { deliverFile, reportFilename } from "@/lib/lira/download";
import { emptyCredentials, loadCredentials, saveCredentials } from "@/lib/lira/credential-store";
import type { AssessorInfo, CredentialFiles, ReportData } from "@/lib/lira/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LIRA Report Maker — City of Monroe" },
      {
        name: "description",
        content: "Fill in a few fields, upload XRF readings, the lab report and photos, and get a finished lead inspection & risk assessment PDF.",
      },
      { property: "og:title", content: "LIRA Report Maker — City of Monroe" },
      { property: "og:description", content: "Create lead inspection & risk assessment reports in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const DEFAULT_ASSESSOR: AssessorInfo = {
  name: "Donta Anderson",
  fullName: "Donta K. Anderson",
  inspectorCert: "DI249483",
  riskAssessorCert: "DR249483",
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyReport = (assessor: AssessorInfo, credentials: CredentialFiles = emptyCredentials()): ReportData => ({
  address: "",
  cityStateZip: "Monroe, LA 71203",
  ownerName: "",
  ownerPhone: "",
  houseType: "Single",
  inspectionDate: today(),
  reportDate: today(),
  assessor,
  credentials,
  headline: "auto",
  coverPhoto: null,
  xrf: [],
  dust: [],
  soil: [],
  soilComment: "No Soil samples were Collected.",
  labPdf: null,
  siteDrawing: null,
  photos: [],
});

function Index() {
  const [data, setData] = useState<ReportData>(() => emptyReport(DEFAULT_ASSESSOR));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string; pages: number } | null>(null);
  const [credsLoaded, setCredsLoaded] = useState(false);

  const set = <K extends keyof ReportData>(k: K, v: ReportData[K]) => {
    setData((d) => ({ ...d, [k]: v }));
  };

  // Remember assessor details, certificates and signature between reports
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lira.assessor");
      if (saved) set("assessor", { ...DEFAULT_ASSESSOR, ...JSON.parse(saved) });
    } catch {
      /* ignore */
    }
    loadCredentials().then((c) => {
      set("credentials", c);
      setCredsLoaded(true);
    });
  }, []);
  useEffect(() => {
    localStorage.setItem("lira.assessor", JSON.stringify(data.assessor));
  }, [data.assessor]);
  useEffect(() => {
    if (credsLoaded) void saveCredentials(data.credentials);
  }, [data.credentials, credsLoaded]);

  // Any change makes the last PDF stale
  useEffect(() => {
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
  }, [data]);

  const xrf = useMemo(() => xrfSummary(data.xrf), [data.xrf]);
  const hazards = useMemo(() => dustHazards(data.dust), [data.dust]);
  const photographed = new Set(data.photos.map((p) => p.reading));
  const photosMissing = xrf.positives.filter((r) => !photographed.has(r.test)).length;

  const checklist = [
    { label: "Property address", done: !!data.address.trim() },
    { label: "Owner name", done: !!data.ownerName.trim() },
    { label: "Cover photo", done: !!data.coverPhoto },
    { label: "XRF readings", done: data.xrf.length > 0 },
    { label: "Lab report PDF", done: !!data.labPdf },
    { label: "Dust wipe results", done: data.dust.length > 0 },
    { label: "Site drawing", done: !!data.siteDrawing },
    { label: "Photo for every positive", done: xrf.positive > 0 ? photosMissing === 0 : true },
  ];
  const ready = checklist.filter((c) => c.done).length;

  const generate = async () => {
    setBusy(true);
    setProgress("Starting…");
    try {
      const { buildReport } = await import("@/lib/lira/pdf/build");
      const bytes = await buildReport(data, setProgress);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const { PDFDocument } = await import("pdf-lib");
      const pages = (await PDFDocument.load(bytes)).getPageCount();
      setResult({ blob, url: URL.createObjectURL(blob), name: reportFilename(data.address), pages });
      toast.success(`Report ready — ${pages} pages`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? `Couldn't build the PDF: ${e.message}` : "Couldn't build the PDF.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const resetAll = () => {
    if (!confirm("Clear everything and start a new report?")) return;
    setData(emptyReport(data.assessor, data.credentials));
  };

  const headlinePositive = data.headline === "auto" ? xrf.positive > 0 : data.headline === "positive";

  return (
    <div className="min-h-screen">
      <header className="border-b bg-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary font-display text-sm font-extrabold text-primary-foreground">
              Pb
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight text-foreground sm:text-xl">LIRA Report Maker</h1>
              <p className="text-xs text-muted-foreground">City of Monroe · Planning & Urban Development</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw /> New report
          </Button>
        </div>
        <div className="letterhead-rule" />
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Section step={1} title="Property" description="Who and where. Used on the cover, letters and property table.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address" id="address">
                <Input id="address" placeholder="203 Sherrouse Ave" value={data.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="City, state, ZIP" id="csz">
                <Input id="csz" value={data.cityStateZip} onChange={(e) => set("cityStateZip", e.target.value)} />
              </Field>
              <Field label="Owner name" id="owner">
                <Input id="owner" placeholder="Ethel Wheaton" value={data.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
              </Field>
              <Field label="Owner phone" id="phone">
                <Input id="phone" placeholder="(318) 555-0100" value={data.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} />
              </Field>
              <Field label="House type" id="house">
                <Select value={data.houseType} onValueChange={(v) => set("houseType", v)}>
                  <SelectTrigger id="house">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Single", "Duplex", "Multi-family", "Mobile home"].map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inspection date" id="idate">
                  <Input id="idate" type="date" value={data.inspectionDate} onChange={(e) => set("inspectionDate", e.target.value)} />
                </Field>
                <Field label="Letter date" id="rdate">
                  <Input id="rdate" type="date" value={data.reportDate} onChange={(e) => set("reportDate", e.target.value)} />
                </Field>
              </div>
            </div>
          </Section>

          <XrfSection readings={data.xrf} onChange={(r) => set("xrf", r)} />

          <LabSection
            labPdf={data.labPdf}
            dust={data.dust}
            soil={data.soil}
            soilComment={data.soilComment}
            onLabPdf={(f) => set("labPdf", f)}
            onDust={(d) => set("dust", d)}
            onSoil={(s) => set("soil", s)}
            onSoilComment={(s) => set("soilComment", s)}
          />

          <MediaSection
            readings={data.xrf}
            coverPhoto={data.coverPhoto}
            siteDrawing={data.siteDrawing}
            photos={data.photos}
            onCover={(f) => set("coverPhoto", f)}
            onDrawing={(f) => set("siteDrawing", f)}
            onPhotos={(p) => set("photos", p)}
          />

          <Section step={5} title="Assessor" description="Your name, certification numbers, certificates and signature. Saved on this computer for next time.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name (cover)" id="aname">
                <Input id="aname" value={data.assessor.name} onChange={(e) => set("assessor", { ...data.assessor, name: e.target.value })} />
              </Field>
              <Field label="Name (signature)" id="afull">
                <Input id="afull" value={data.assessor.fullName} onChange={(e) => set("assessor", { ...data.assessor, fullName: e.target.value })} />
              </Field>
              <Field label="Lead Inspector cert #" id="icert">
                <Input id="icert" value={data.assessor.inspectorCert} onChange={(e) => set("assessor", { ...data.assessor, inspectorCert: e.target.value })} />
              </Field>
              <Field label="Risk Assessor cert #" id="rcert">
                <Input id="rcert" value={data.assessor.riskAssessorCert} onChange={(e) => set("assessor", { ...data.assessor, riskAssessorCert: e.target.value })} />
              </Field>
            </div>
            <CredentialsUpload
              value={data.credentials}
              onChange={(c) => set("credentials", c)}
              defaultOwner={DEFAULT_ASSESSOR.name}
              otherAssessor={
                data.assessor.name.trim() !== DEFAULT_ASSESSOR.name ||
                data.assessor.inspectorCert.trim() !== DEFAULT_ASSESSOR.inspectorCert ||
                data.assessor.riskAssessorCert.trim() !== DEFAULT_ASSESSOR.riskAssessorCert
              }
            />
          </Section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="sheet overflow-hidden">
            <div className="border-b bg-primary px-5 py-4 text-primary-foreground">
              <div className="text-xs font-semibold uppercase tracking-widest opacity-80">Report</div>
              <div className="mt-1 truncate font-display text-lg font-bold">{data.address || "New property"}</div>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Mini label="XRF positives" value={`${xrf.positive}/${xrf.total}`} tone={xrf.positive ? "positive" : undefined} />
                <Mini label="Dust hazards" value={`${hazards.length}/${data.dust.length}`} tone={hazards.length ? "positive" : undefined} />
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">Headline page</Label>
                <Select value={data.headline} onValueChange={(v) => set("headline", v as ReportData["headline"])}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic (from XRF)</SelectItem>
                    <SelectItem value="positive">Positive: Lead-Based Paint</SelectItem>
                    <SelectItem value="negative">No Lead-Based Paint</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2">
                  <StatusPill tone={headlinePositive ? "positive" : "negative"}>
                    {headlinePositive ? "Positive: Lead-Based Paint" : "No Lead-Based Paint"}
                  </StatusPill>
                </div>
              </div>

              <ul className="space-y-1.5 text-sm">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2">
                    {c.done ? <CheckCircle2 className="size-4 text-negative" /> : <Circle className="size-4 text-muted-foreground" />}
                    <span className={c.done ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                  </li>
                ))}
              </ul>

              {result ? (
                <div className="space-y-2">
                  <Button variant="generate" size="xl" className="w-full" onClick={() => deliverFile(result.blob, result.name)}>
                    <Download /> Download PDF
                  </Button>
                  <Button variant="outline" className="w-full" asChild>
                    <a href={result.url} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open preview ({result.pages} pages)
                    </a>
                  </Button>
                </div>
              ) : (
                <Button variant="generate" size="xl" className="w-full" disabled={busy} onClick={generate}>
                  {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
                  {busy ? "Building…" : "Create report PDF"}
                </Button>
              )}
              <p className="min-h-4 text-center text-xs text-muted-foreground">
                {busy ? progress : ready < checklist.length ? `${ready} of ${checklist.length} items ready — you can still create a draft` : "Everything's in. Ready to go."}
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "positive" | undefined }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <div className={`stat-number text-xl ${tone ? "text-positive" : "text-ink"}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
