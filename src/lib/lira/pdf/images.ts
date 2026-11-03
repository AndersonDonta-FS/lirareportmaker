/**
 * Convert any browser-readable image (JPEG, PNG, HEIC on Safari, WebP...) into
 * a downsized JPEG suitable for embedding. Optionally center-crops to an aspect ratio.
 */
export async function fileToJpeg(
  file: File,
  opts: { maxDim?: number; aspect?: number; quality?: number } = {},
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const maxDim = opts.maxDim ?? 1600;
  const bmp = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bmp.width;
  let sh = bmp.height;
  if (opts.aspect) {
    const cur = sw / sh;
    if (cur > opts.aspect) {
      const nw = sh * opts.aspect;
      sx = (sw - nw) / 2;
      sw = nw;
    } else {
      const nh = sw / opts.aspect;
      sy = (sh - nh) / 2;
      sh = nh;
    }
  }
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not convert image"))), "image/jpeg", opts.quality ?? 0.85),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}
