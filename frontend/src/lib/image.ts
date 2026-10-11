// The server squashes every image to the model's input size (32x32 for the CNN), so
// sending a multi-megapixel photo only wastes upload time and can exceed Vercel's
// 4.5 MB body limit. Downscale in the browser (keeping aspect ratio, which the
// server's resize then squashes exactly as it would the original) and re-encode as PNG.
// That also means any format the browser can decode (WebP, GIF, AVIF, ...) works.

const MAX_SIDE = 512;
const THUMB_SIDE = 96;

export const ACCEPTED_TYPES = "image/*";

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file couldn't be read as an image."));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, maxSide: number, type: string, quality?: number): string {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this image.");
  ctx.imageSmoothingQuality = "high";
  if (type === "image/jpeg") {
    // JPEG has no alpha; without this, transparent PNGs turn black in the thumbnail
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}

export interface PreparedImage {
  /** Data URL shown in the preview. */
  previewUrl: string;
  /** Base64 payload for POST /predict (no data: prefix). */
  base64: string;
  /** Small JPEG data URL kept in history. */
  thumbnail: string;
  width: number;
  height: number;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPEG, WebP, …).");
  }
  const img = await loadImage(file);
  const previewUrl = draw(img, MAX_SIDE, "image/png");
  return {
    previewUrl,
    base64: previewUrl.slice(previewUrl.indexOf(",") + 1),
    thumbnail: draw(img, THUMB_SIDE, "image/jpeg", 0.8),
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}
