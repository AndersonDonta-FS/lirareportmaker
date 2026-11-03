import { useState } from "react";
import { FileText, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileDrop } from "./FileDrop";
import { Section, StatusPill } from "./Section";
import { isDustPositive } from "@/lib/lira/rules";
import { extractLabResults } from "@/lib/lira/lab.functions";
import { fileToDataUrl } from "@/lib/lira/pdf/images";
import type { DustSample, SoilSample } from "@/lib/lira/types";

type Props = {
  labPdf: File | null;
  dust: DustSample[];
  soil: SoilSample[];
  soilComment: string;
  onLabPdf: (f: File | null) => void;
  onDust: (d: DustSample[]) => void;
  onSoil: (s: SoilSample[]) => void;
  onSoilComment: (s: string) => void;
};

export function LabSection(p: Props) {
  const [reading, setReading] = useState(false);

  const readLab = async (file: File) => {
    setReading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await extractLabResults({ data: { filename: file.name, dataUrl } });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (!res.samples.length) {
        toast.warning("No dust wipe samples found in that report. Add them below.");
        return;
      }
      // Keep surfaces the user already typed for matching sample IDs.
      const prev = new Map(p.dust.map((d) => [d.id, d]));
      p.onDust(
        res.samples.map((s) => ({
          id: s.id,
          location: s.location,
          surface: s.surface || prev.get(s.id)?.surface || "",
          result: s.result,
        })),
      );
      toast.success(`Read ${res.samples.length} dust wipe results. Check them over and fill in surfaces.`);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't read the lab report. You can type the results in below.");
    } finally {
      setReading(false);
    }
  };

  const update = (i: number, patch: Partial<DustSample>) => p.onDust(p.dust.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <Section step={3} title="Lab results" description="Upload the EMSL report. It's attached as Appendix B and the dust results are read automatically.">
      <div className="space-y-5">
        {!p.labPdf ? (
          <FileDrop
            accept="application/pdf,.pdf"
            testId="lab-input"
            onFiles={(f) => {
              p.onLabPdf(f[0]);
              void readLab(f[0]);
            }}
            label="Drop the lab report PDF here or click to choose"
            hint="All pages are added to the report"
          />
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-ink" />
              <span className="truncate font-medium">{p.labPdf.name}</span>
              {reading && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Reading results…
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" disabled={reading} onClick={() => p.labPdf && readLab(p.labPdf)}>
                <Sparkles /> Re-read
              </Button>
              <Button variant="ghost" size="sm" onClick={() => p.onLabPdf(null)}>
                <X /> Remove
              </Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dust wipe findings</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => p.onDust([...p.dust, { id: String(p.dust.length + 1), location: "", surface: "", result: "<2" }])}
            >
              <Plus /> Add sample
            </Button>
          </div>
          {p.dust.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              {reading ? "Reading the lab report…" : "No samples yet. Upload the lab report or add them by hand."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-16 px-2 py-1.5">ID</th>
                    <th className="px-2 py-1.5">Room</th>
                    <th className="w-32 px-2 py-1.5">Surface</th>
                    <th className="w-24 px-2 py-1.5">µg/ft²</th>
                    <th className="w-24 px-2 py-1.5">Lead</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {p.dust.map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-1 py-1">
                        <Input value={d.id} onChange={(e) => update(i, { id: e.target.value })} className="h-8" />
                      </td>
                      <td className="px-1 py-1">
                        <Input value={d.location} onChange={(e) => update(i, { location: e.target.value })} className="h-8" />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          value={d.surface}
                          list="surface-options"
                          placeholder="Tile…"
                          onChange={(e) => update(i, { surface: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input value={d.result} onChange={(e) => update(i, { result: e.target.value })} className="h-8 font-mono" />
                      </td>
                      <td className="px-2 py-1">
                        {isDustPositive(d.result) ? <StatusPill tone="positive">Positive</StatusPill> : <StatusPill tone="negative">Negative</StatusPill>}
                      </td>
                      <td className="px-1 py-1">
                        <Button variant="ghost" size="icon" aria-label="Remove sample" onClick={() => p.onDust(p.dust.filter((_, j) => j !== i))}>
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="surface-options">
                {["Tile", "Carpet", "Wood", "Concrete", "Vinyl", "Laminate"].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Any reported number counts as a dust-lead hazard (2026 EPA rule). Results below the reporting limit like “&lt;2” are negative.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Soil samples</Label>
              <Button variant="ghost" size="sm" onClick={() => p.onSoil([...p.soil, { id: String(p.soil.length + 1), area: "", result: "" }])}>
                <Plus /> Add
              </Button>
            </div>
            {p.soil.length === 0 ? (
              <p className="text-sm text-muted-foreground">None — shows N/A in the report.</p>
            ) : (
              <div className="space-y-1.5">
                {p.soil.map((s, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input className="h-8 w-12" value={s.id} onChange={(e) => p.onSoil(p.soil.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} />
                    <Input className="h-8" placeholder="Area" value={s.area} onChange={(e) => p.onSoil(p.soil.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)))} />
                    <Input className="h-8 w-24" placeholder="Result" value={s.result} onChange={(e) => p.onSoil(p.soil.map((x, j) => (j === i ? { ...x, result: e.target.value } : x)))} />
                    <Button variant="ghost" size="icon" aria-label="Remove soil sample" onClick={() => p.onSoil(p.soil.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="soil-comment" className="mb-2 block">
              Soil sampling comments
            </Label>
            <Textarea id="soil-comment" rows={2} value={p.soilComment} onChange={(e) => p.onSoilComment(e.target.value)} />
          </div>
        </div>
      </div>
    </Section>
  );
}
