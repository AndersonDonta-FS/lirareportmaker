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

/**
 * Turn a signature photo/scan into a tight, transparent PNG: light paper
 * becomes transparent and the image is cropped to the ink.
 */
export async function signatureToPng(file: File): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
      if (lum > 170) {
        px[i + 3] = 0;
      } else {
        // fade anti-aliased edges, keep ink colour
        px[i + 3] = Math.min(255, Math.round(((170 - lum) / 120) * 255));
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (maxX < 0) throw new Error("The signature image looks blank");
  const pad = 6;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - cx;
  const ch = Math.min(h, maxY + pad + 1) - cy;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("Could not read signature"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
