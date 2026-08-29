"use client";

import * as faceapi from "face-api.js";

let loaded = false;
let loading: Promise<void> | null = null;

/** Reused canvas so we don't allocate every frame */
let scanCanvas: HTMLCanvasElement | null = null;
let scanCtx: CanvasRenderingContext2D | null = null;

const MODEL_URLS = [
  "/weights",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights",
  "https://unpkg.com/face-api.js@0.22.2/weights",
];

async function loadFrom(url: string) {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(url),
    faceapi.nets.faceLandmark68Net.loadFromUri(url),
    faceapi.nets.faceRecognitionNet.loadFromUri(url),
  ]);
}

export async function loadFaceModels() {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    let last: unknown;
    for (const url of MODEL_URLS) {
      try {
        await loadFrom(url);
        loaded = true;
        loading = null;
        return;
      } catch (err) {
        last = err;
      }
    }
    loading = null;
    throw last || new Error("Face models failed to load");
  })();
  return loading;
}

export type FaceScanError = "no_face" | "too_far" | "multiple" | "partial" | "off_center" | "low_quality";

export type FaceScan =
  | { ok: true; descriptor: number[]; box: { x: number; y: number; width: number; height: number } }
  | { ok: false; error: FaceScanError };

export type ScanFaceOptions = {
  /** Stricter rules for first-time face registration */
  strict?: boolean;
};

function detector(strict: boolean) {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: strict ? 320 : 224,
    scoreThreshold: strict ? 0.5 : 0.45,
  });
}

/** Downscale frame before ML — biggest speed win on mid-range Android */
function frameForScan(video: HTMLVideoElement, maxSide: number) {
  if (!scanCanvas) {
    scanCanvas = document.createElement("canvas");
    scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = scanCtx;
  if (!ctx || !video.videoWidth) return null;

  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  if (scanCanvas.width !== w || scanCanvas.height !== h) {
    scanCanvas.width = w;
    scanCanvas.height = h;
  }
  ctx.drawImage(video, 0, 0, w, h);
  return { canvas: scanCanvas, scale: scale || 1 };
}

function avgPoint(points: faceapi.Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x, y };
}

function validateFaceGeometry(
  detection: faceapi.WithFaceDescriptor<
    faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>
  >,
  videoWidth: number,
  videoHeight: number,
  strict: boolean
): FaceScanError | null {
  const box = detection.detection.box;
  const score = detection.detection.score;
  const minSide = Math.min(videoWidth, videoHeight);
  const faceSide = Math.min(box.width, box.height);

  const minRatio = strict ? 0.2 : 0.16;
  if (faceSide < minSide * minRatio) return "too_far";

  const maxRatio = strict ? 0.78 : 0.85;
  if (faceSide > minSide * maxRatio) return "too_far";

  const aspect = box.width / Math.max(box.height, 1);
  if (aspect < 0.55 || aspect > 1.45) return "partial";

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const xPad = strict ? 0.22 : 0.16;
  const yPad = strict ? 0.24 : 0.18;
  if (cx < videoWidth * xPad || cx > videoWidth * (1 - xPad)) return "off_center";
  if (cy < videoHeight * yPad || cy > videoHeight * (1 - yPad)) return "off_center";

  if (box.x < videoWidth * 0.03 || box.x + box.width > videoWidth * 0.97) return "partial";
  if (box.y < videoHeight * 0.05 || box.y + box.height > videoHeight * 0.95) return "partial";

  if (score < (strict ? 0.52 : 0.45)) return "low_quality";

  const lm = detection.landmarks.positions;
  if (lm.length < 68) return "partial";

  const leftEye = avgPoint(lm.slice(36, 42));
  const rightEye = avgPoint(lm.slice(42, 48));
  const nose = lm[30];
  const mouth = avgPoint(lm.slice(48, 68));
  const jaw = lm.slice(0, 17);

  const eyeY = (leftEye.y + rightEye.y) / 2;
  if (eyeY >= nose.y - box.height * 0.02) return "partial";
  if (mouth.y <= nose.y + box.height * 0.06) return "partial";

  const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  if (eyeDist < box.width * 0.2) return "partial";

  const landmarkMinY = Math.min(...jaw.map((p) => p.y));
  const landmarkMaxY = Math.max(...lm.map((p) => p.y));
  const landmarkSpan = landmarkMaxY - landmarkMinY;
  if (landmarkSpan < box.height * (strict ? 0.72 : 0.65)) return "partial";

  const chin = lm[8];
  if (chin.y < box.y + box.height * 0.5) return "partial";

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  if (Math.abs(nose.x - eyeMidX) > box.width * 0.25) return "partial";

  return null;
}

export function averageDescriptors(samples: number[][]): number[] {
  if (!samples.length) return [];
  const len = samples[0].length;
  const out = new Array(len).fill(0);
  for (const sample of samples) {
    if (sample.length !== len) continue;
    for (let i = 0; i < len; i++) out[i] += sample[i];
  }
  const n = samples.length;
  for (let i = 0; i < len; i++) out[i] /= n;
  return out;
}

export async function scanFace(video: HTMLVideoElement, opts: ScanFaceOptions = {}): Promise<FaceScan> {
  const strict = Boolean(opts.strict);
  await loadFaceModels();
  if (!video.videoWidth) return { ok: false, error: "no_face" };

  const frame = frameForScan(video, strict ? 320 : 224);
  if (!frame) return { ok: false, error: "no_face" };

  const detections = await faceapi
    .detectAllFaces(frame.canvas, detector(strict))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!detections.length) return { ok: false, error: "no_face" };

  detections.sort(
    (a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height
  );
  const best = detections[0];
  const inv = 1 / frame.scale;
  const box = best.detection.box;
  const minSide = Math.min(frame.canvas.width, frame.canvas.height);

  for (let i = 1; i < detections.length; i++) {
    const other = detections[i].detection;
    const side = Math.min(other.box.width, other.box.height);
    // Any second face in frame → block (group / standing behind)
    if (other.score >= 0.22 || side > minSide * 0.06) {
      return { ok: false, error: "multiple" };
    }
  }

  const geoError = validateFaceGeometry(best, frame.canvas.width, frame.canvas.height, strict);
  if (geoError) return { ok: false, error: geoError };

  return {
    ok: true,
    descriptor: Array.from(best.descriptor),
    box: {
      x: box.x * inv,
      y: box.y * inv,
      width: box.width * inv,
      height: box.height * inv,
    },
  };
}
