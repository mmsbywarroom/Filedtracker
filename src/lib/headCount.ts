"use client";

import type * as cocoSsd from "@tensorflow-models/coco-ssd";
import { countHeadsFromDataUrl as countFacesFromDataUrl, loadHeadCountModels } from "@/lib/face";

type Detector = cocoSsd.ObjectDetection;
type Box = { x: number; y: number; width: number; height: number; score: number };

let net: Detector | null = null;
let loading: Promise<Detector> | null = null;

function sourceSize(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
  if (source instanceof HTMLVideoElement) return { w: source.videoWidth, h: source.videoHeight };
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth || source.width, h: source.naturalHeight || source.height };
  }
  return { w: source.width, h: source.height };
}

function toCanvas(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  maxSide: number
): HTMLCanvasElement | null {
  const { w, h } = sourceSize(source);
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

function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

function nms(boxes: Box[], thresh = 0.4) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: Box[] = [];
  for (const box of sorted) {
    if (keep.some((k) => iou(k, box) > thresh)) continue;
    keep.push(box);
  }
  return keep;
}

export async function loadPersonCountModel() {
  if (net) return net;
  if (loading) return loading;
  loading = (async () => {
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    const coco = await import("@tensorflow-models/coco-ssd");
    net = await coco.load({ base: "lite_mobilenet_v2" });
    loading = null;
    return net;
  })();
  return loading;
}

/**
 * Count people in any vehicle photo (car, bus, tempo, tractor, bike, …).
 * Two scales: close cabin (car) + wide shot (bus / outdoor tractor).
 */
export async function countPeople(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<number> {
  const { w, h } = sourceSize(source);
  if (!w || !h) return 0;
  const model = await loadPersonCountModel();
  const boxes: Box[] = [];
  for (const maxSide of [480, 800]) {
    const canvas = toCanvas(source, maxSide);
    if (!canvas) continue;
    const sx = w / canvas.width;
    const sy = h / canvas.height;
    const preds = await model.detect(canvas, 50, 0.28);
    for (const p of preds) {
      if (p.class !== "person") continue;
      const [x, y, bw, bh] = p.bbox;
      if (bw * sx < 8 || bh * sy < 8) continue;
      boxes.push({
        x: x * sx,
        y: y * sy,
        width: bw * sx,
        height: bh * sy,
        score: p.score,
      });
    }
  }
  return nms(boxes).length;
}

export async function countHeadsFromDataUrl(dataUrl: string): Promise<number> {
  const img = new Image();
  img.decoding = "async";
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("photo"));
  });
  if (typeof img.decode === "function") await img.decode().catch(() => {});

  const people = await countPeople(img).catch(() => 0);
  await loadHeadCountModels().catch(() => null);
  const faces = await countFacesFromDataUrl(dataUrl).catch(() => 0);
  return Math.min(200, Math.max(people, faces));
}

export async function countHeads(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<number> {
  const canvas = toCanvas(source, 960);
  if (!canvas) return 0;
  return countHeadsFromDataUrl(canvas.toDataURL("image/jpeg", 0.85));
}
