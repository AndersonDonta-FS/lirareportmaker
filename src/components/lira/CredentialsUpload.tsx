import { useEffect, useState } from "react";
import { AlertTriangle, FileText, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileDrop } from "./FileDrop";
import type { CredentialFiles } from "@/lib/lira/types";

type Props = {
  value: CredentialFiles;
  onChange: (c: CredentialFiles) => void;
  /** Name the built-in documents belong to */
  defaultOwner: string;
  /** Whether the assessor on the form is someone other than the built-in owner */
  otherAssessor: boolean;
};

export function CredentialsUpload({ value, onChange, defaultOwner, otherAssessor }: Props) {
  const missing = [
    !value.training.length && "training certificate",
    !value.ldeq.length && "LDEQ certifications",
    !value.signature && "signature",
  ].filter(Boolean) as string[];

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">Certificates & signature</h3>
        <p className="text-xs text-muted-foreground">
          Upload your own to replace {defaultOwner}'s in Appendix E and on the letters. Scans, phone photos or PDFs all work. Saved on this computer.
        </p>
      </div>

      {otherAssessor && missing.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-caution/40 bg-caution-soft px-3 py-2 text-sm text-caution">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The report will still use {defaultOwner}'s {missing.join(", ")}. Upload yours below.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MultiSlot
          label="Training certificate"
          files={value.training}
          fallback={`${defaultOwner}'s SciAps certificate`}
          testId="training-cert-input"
          onChange={(training) => onChange({ ...value, training })}
        />
        <MultiSlot
          label="LDEQ certifications"
          files={value.ldeq}
          fallback={`${defaultOwner}'s Inspector & Risk Assessor certs`}
          testId="ldeq-cert-input"
          onChange={(ldeq) => onChange({ ...value, ldeq })}
        />
        <SignatureSlot file={value.signature} fallback={`${defaultOwner}'s signature`} onChange={(signature) => onChange({ ...value, signature })} />
      </div>
    </div>
  );
}

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

function MultiSlot({
  label,
  files,
  fallback,
  testId,
  onChange,
}: {
  label: string;
  files: File[];
  fallback: string;
  testId: string;
  onChange: (f: File[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="block">{label}</Label>
      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
              {isPdf(f) ? <FileText className="size-4 shrink-0 text-ink" /> : <ImageIcon className="size-4 shrink-0 text-ink" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <Button variant="ghost" size="icon" className="size-6" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Using {fallback}</p>
      )}
      <FileDrop
        accept="image/*,application/pdf"
        multiple
        testId={testId}
        onFiles={(f) => onChange([...files, ...f])}
        label={files.length ? "Add another" : "Upload yours"}
        hint="Image or PDF"
        className="py-4"
      />
    </div>
  );
}

function SignatureSlot({ file, fallback, onChange }: { file: File | null; fallback: string; onChange: (f: File | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="space-y-2">
      <Label className="block">Signature</Label>
      {url ? (
        <div className="relative flex h-[104px] items-center justify-center rounded-lg border bg-paper p-2">
          <img src={url} alt="Your signature" className="max-h-full max-w-full object-contain" />
          <Button variant="secondary" size="sm" className="absolute right-1.5 top-1.5" onClick={() => onChange(null)}>
            <X /> Remove
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Using {fallback}</p>
          <FileDrop
            accept="image/*"
            testId="signature-input"
            onFiles={(f) => onChange(f[0] ?? null)}
            label="Upload yours"
            hint="Sign on white paper and snap a photo"
            className="py-4"
          />
        </>
      )}
    </div>
  );
}
