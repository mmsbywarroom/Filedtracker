"use client";

import type * as cocoSsd from "@tensorflow-models/coco-ssd";

type Detector = cocoSsd.ObjectDetection;

let net: Detector | null = null;
let loading: Promise<Detector> | null = null;

function sourceSize(source: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; naturalWidth?: number }) {
  if (source instanceof HTMLVideoElement) return { w: source.videoWidth, h: source.videoHeight };
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth || source.width, h: source.naturalHeight || source.height };
  }
  if (source instanceof HTMLCanvasElement) return { w: source.width, h: source.height };
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { w: source.width, h: source.height };
  }
  return { w: Number(source.width) || 0, h: Number(source.height) || 0 };
}

function toCanvas(source: CanvasImageSource, maxSide: number): HTMLCanvasElement | null {
  const { w, h } = sourceSize(source as never);
  if (!w || !h) return null;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(32, Math.round(w * scale));
  canvas.height = Math.max(32, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rotateCanvas(src: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (deg === 0) return src;
  const canvas = document.createElement("canvas");
  const swap = deg === 90 || deg === 270;
  canvas.width = swap ? src.height : src.width;
  canvas.height = swap ? src.width : src.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return canvas;
}

export async function loadPersonCountModel() {
  if (net) return net;
  if (loading) return loading;
  loading = (async () => {
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    const coco = await import("@tensorflow-models/coco-ssd");
    net = await coco.load({ base: "mobilenet_v2" });
    loading = null;
    return net;
  })();
  return loading;
}

async function detectPeopleOn(canvas: HTMLCanvasElement, model: Detector) {
  const preds = await model.detect(canvas, 60, 0.2);
  return preds.filter((p) => p.class === "person" && p.bbox[2] >= 6 && p.bbox[3] >= 6).length;
}

/**
 * Count people in any photo (car, bus, hall, tractor…).
 * Tries EXIF-upright + 4 rotations because phone gallery shots are often sideways.
 */
export async function countPeople(source: CanvasImageSource): Promise<number> {
  const model = await loadPersonCountModel();
  const base = toCanvas(source, 640);
  if (!base) return 0;
  let best = 0;
  for (const deg of [0, 90, 180, 270] as const) {
    const n = await detectPeopleOn(rotateCanvas(base, deg), model);
    if (n > best) best = n;
  }
  return best;
}

export async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap | HTMLImageElement> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("photo"));
    });
    return img;
  }
}

export async function countHeadsFromDataUrl(dataUrl: string): Promise<number> {
  const src = await bitmapFromDataUrl(dataUrl);
  const n = await countPeople(src);
  if ("close" in src && typeof src.close === "function") src.close();
  return Math.min(200, n);
}

export async function fileToJpegDataUrl(file: File): Promise<string> {
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    bmp = await createImageBitmap(file);
  }
  const canvas = toCanvas(bmp, 1280);
  bmp.close();
  if (!canvas) return "";
  return canvas.toDataURL("image/jpeg", 0.82);
}
