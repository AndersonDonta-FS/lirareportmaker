import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  testId?: string;
};

export function FileDrop({ accept, multiple, onFiles, label, hint, className, testId }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      data-active={active}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn("dropzone flex cursor-pointer flex-col items-center justify-center gap-1.5 px-4 py-6 text-center", className)}
    >
      <Upload className="size-5 text-ink" aria-hidden />
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        data-testid={testId}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
