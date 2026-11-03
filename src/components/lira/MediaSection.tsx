import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDrop } from "./FileDrop";
import { Section } from "./Section";
import { photoCaption, positiveHazardReadings } from "@/lib/lira/rules";
import type { PhotoEntry, XrfReading } from "@/lib/lira/types";

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** Guess which reading a photo shows: a number in the file name, else the next unphotographed positive. */
export function autoAssign(files: File[], existing: PhotoEntry[], readings: XrfReading[]): PhotoEntry[] {
  const tests = new Set(readings.map((r) => r.test));
  const taken = new Set(existing.map((p) => p.reading));
  const queue = positiveHazardReadings(readings).map((r) => r.test).filter((t) => !taken.has(t));
  return files.map((file) => {
    const nums = file.name.replace(/\.[^.]+$/, "").match(/\d+/g) ?? [];
    let reading = nums.find((n) => tests.has(String(Number(n))) && !taken.has(String(Number(n))));
    if (reading) reading = String(Number(reading));
    else reading = queue.shift() ?? "";
    if (reading) {
      taken.add(reading);
      const qi = queue.indexOf(reading);
      if (qi >= 0) queue.splice(qi, 1);
    }
    return { id: crypto.randomUUID(), file, reading };
  });
}

type Props = {
  readings: XrfReading[];
  coverPhoto: File | null;
  siteDrawing: File | null;
  photos: PhotoEntry[];
  onCover: (f: File | null) => void;
  onDrawing: (f: File | null) => void;
  onPhotos: (p: PhotoEntry[]) => void;
};

export function MediaSection(p: Props) {
  const positives = useMemo(() => positiveHazardReadings(p.readings), [p.readings]);
  const photographed = new Set(p.photos.map((x) => x.reading));
  const missing = positives.filter((r) => !photographed.has(r.test));

  return (
    <Section step={4} title="Photos & drawing" description="Cover photo, site drawing, and a photo for each positive reading.">
      <div className="grid gap-4 sm:grid-cols-2">
        <SingleImage label="Cover photo (front of house)" file={p.coverPhoto} onChange={p.onCover} testId="cover-input" />
        <SingleImage label="Site drawing" file={p.siteDrawing} onChange={p.onDrawing} testId="drawing-input" />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <Label>Photos of located lead</Label>
          {positives.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {positives.length - missing.length} of {positives.length} positives have a photo
            </span>
          )}
        </div>
        <FileDrop
          accept="image/*"
          multiple
          testId="photos-input"
          onFiles={(files) => p.onPhotos([...p.photos, ...autoAssign(files, p.photos, p.readings)])}
          label="Drop photos here or click to choose"
          hint="Name files with the reading number (e.g. 17.jpg) and they're matched automatically"
          className="py-5"
        />
        {p.photos.length > 0 && (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {p.photos.map((ph) => (
              <PhotoRow
                key={ph.id}
                photo={ph}
                readings={p.readings}
                positives={positives}
                onReading={(reading) => p.onPhotos(p.photos.map((x) => (x.id === ph.id ? { ...x, reading } : x)))}
                onRemove={() => p.onPhotos(p.photos.filter((x) => x.id !== ph.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function SingleImage({ label, file, onChange, testId }: { label: string; file: File | null; onChange: (f: File | null) => void; testId: string }) {
  const url = useObjectUrl(file);
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {url ? (
        <div className="group relative overflow-hidden rounded-lg border bg-background">
          <img src={url} alt={label} className="h-40 w-full object-cover" />
          <Button variant="secondary" size="sm" className="absolute right-2 top-2" onClick={() => onChange(null)}>
            <X /> Remove
          </Button>
        </div>
      ) : (
        <FileDrop accept="image/*" onFiles={(f) => onChange(f[0])} testId={testId} label="Choose image" hint="JPG, PNG or phone photo" className="h-40" />
      )}
    </div>
  );
}

function PhotoRow({
  photo,
  readings,
  positives,
  onReading,
  onRemove,
}: {
  photo: PhotoEntry;
  readings: XrfReading[];
  positives: XrfReading[];
  onReading: (r: string) => void;
  onRemove: () => void;
}) {
  const url = useObjectUrl(photo.file);
  const r = readings.find((x) => x.test === photo.reading);
  const cap = r ? photoCaption(r) : null;
  const others = readings.filter((x) => !positives.includes(x));
  return (
    <li className="flex gap-3 rounded-lg border bg-background p-2">
      {url ? (
        <img src={url} alt="" className="size-20 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex size-20 items-center justify-center rounded-md bg-muted">
          <ImageIcon className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <Select value={photo.reading || undefined} onValueChange={onReading}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Which reading?" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Positive readings</SelectLabel>
              {positives.map((x) => (
                <SelectItem key={x.test} value={x.test}>
                  Reading {x.test} — {x.pb} · {[x.room, x.location].filter(Boolean).join(" ")}
                </SelectItem>
              ))}
            </SelectGroup>
            {others.length > 0 && (
              <SelectGroup>
                <SelectLabel>Other readings</SelectLabel>
                {others.map((x) => (
                  <SelectItem key={x.test} value={x.test}>
                    Reading {x.test} — {x.pb}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <p className="truncate text-xs text-muted-foreground">
          {cap ? `${cap.location} · ${cap.side} · ${cap.component}` : photo.file.name}
        </p>
      </div>
      <Button variant="ghost" size="icon" aria-label="Remove photo" onClick={onRemove}>
        <Trash2 />
      </Button>
    </li>
  );
}
