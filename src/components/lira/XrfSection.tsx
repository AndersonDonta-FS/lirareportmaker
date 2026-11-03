import { useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDrop } from "./FileDrop";
import { Section, StatusPill } from "./Section";
import { parseXrfFile } from "@/lib/lira/xrf-import";
import { isCalibration, xrfSummary } from "@/lib/lira/rules";
import type { XrfReading } from "@/lib/lira/types";

const FIELD_LABELS: Record<string, string> = {
  locationType: "Location Type",
  room: "Room",
  location: "Location",
  substrate: "Substrate",
  condition: "Condition",
  color: "Color",
};

export function XrfSection({ readings, onChange }: { readings: XrfReading[]; onChange: (r: XrfReading[]) => void }) {
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const s = xrfSummary(readings);
  const calibrations = readings.filter(isCalibration).length;

  const handle = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setLoading(true);
    try {
      const { readings: rows, missing } = await parseXrfFile(f);
      if (!rows.length) {
        toast.error("Couldn't find XRF readings in that file. It needs at least a Test # column and a Pb column.");
        return;
      }
      setFileName(f.name);
      setMissing(missing);
      onChange(rows);
      toast.success(`Loaded ${rows.length} readings`);
    } catch (e) {
      console.error(e);
      toast.error("That file couldn't be opened. Try saving it as .csv or .xlsx.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section
      step={2}
      title="XRF readings"
      description="Upload the SciAps export. Calibration rows turn yellow, positives turn red in the report."
    >
      {readings.length === 0 ? (
        <FileDrop
          accept=".csv,.xlsx,.xls,text/csv"
          onFiles={handle}
          testId="xrf-input"
          label={loading ? "Reading file…" : "Drop the XRF export here or click to choose"}
          hint="CSV or Excel. Columns like Test #, Location Type, Room, Location, Pb, Pb Pos/Neg…"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 text-ink" />
              <span className="truncate font-medium">{fileName || "XRF readings"}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange([]);
                setFileName("");
                setMissing([]);
              }}
            >
              <X /> Replace
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total readings" value={s.total} />
            <Stat label="Positive (≥ 1.0)" value={s.positive} tone="positive" />
            <Stat label="Calibration" value={calibrations} tone="caution" />
          </div>
          {missing.length > 0 && (
            <p className="rounded-md bg-caution-soft px-3 py-2 text-xs text-foreground">
              These columns weren't found and will be blank: {missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}.
            </p>
          )}
          {s.positives.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Positive readings → hazard table
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5">Test #</th>
                      <th className="px-3 py-1.5">Where</th>
                      <th className="px-3 py-1.5 text-right">Pb</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.positives.map((r) => (
                      <tr key={r.test} className="border-t">
                        <td className="px-3 py-1.5 font-mono text-xs">{r.test}</td>
                        <td className="px-3 py-1.5">{[r.locationType, r.room, r.location].filter(Boolean).join(" · ")}</td>
                        <td className="px-3 py-1.5 text-right">
                          <StatusPill tone="positive">{r.pb}</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {loading && readings.length > 0 && <Loader2 className="mt-2 size-4 animate-spin" />}
    </Section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "positive" | "caution" }) {
  const color = tone === "positive" ? "text-positive" : tone === "caution" ? "text-caution" : "text-ink";
  return (
    <div className="rounded-lg border bg-background px-3 py-3">
      <div className={`stat-number text-2xl ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
