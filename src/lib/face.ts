"use client";

import * as faceapi from "face-api.js";

let loaded = false;
let loading: Promise<void> | null = null;

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
    inputSize: strict ? 416 : 320,
    scoreThreshold: strict ? 0.52 : 0.35,
  });
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

  const minRatio = strict ? 0.2 : 0.12;
  if (faceSide < minSide * minRatio) return "too_far";

  const maxRatio = strict ? 0.78 : 0.92;
  if (faceSide > minSide * maxRatio) return "too_far";

  const aspect = box.width / Math.max(box.height, 1);
  if (aspect < 0.55 || aspect > 1.45) return "partial";

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (strict) {
    if (cx < videoWidth * 0.24 || cx > videoWidth * 0.76) return "off_center";
    if (cy < videoHeight * 0.26 || cy > videoHeight * 0.74) return "off_center";
  }

  // Face must not be clipped at edges (partial / top-of-head only shots)
  if (box.x < videoWidth * 0.04 || box.x + box.width > videoWidth * 0.96) return "partial";
  if (box.y < videoHeight * 0.06 || box.y + box.height > videoHeight * 0.94) return "partial";

  if (strict && score < 0.55) return "low_quality";

  const lm = detection.landmarks.positions;
  if (lm.length < 68) return "partial";

  const leftEye = avgPoint(lm.slice(36, 42));
  const rightEye = avgPoint(lm.slice(42, 48));
  const nose = lm[30];
  const mouth = avgPoint(lm.slice(48, 68));
  const jaw = lm.slice(0, 17);

  // Full face: eyes above nose, mouth clearly below nose
  const eyeY = (leftEye.y + rightEye.y) / 2;
  if (eyeY >= nose.y - box.height * 0.02) return "partial";
  if (mouth.y <= nose.y + box.height * 0.08) return "partial";

  const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  if (eyeDist < box.width * 0.22) return "partial";

  const landmarkMinY = Math.min(...jaw.map((p) => p.y));
  const landmarkMaxY = Math.max(...lm.map((p) => p.y));
  const landmarkSpan = landmarkMaxY - landmarkMinY;
  if (landmarkSpan < box.height * 0.72) return "partial";

  // Chin should sit near bottom of detection box (not just forehead / top of head)
  const chin = lm[8];
  if (chin.y < box.y + box.height * 0.55) return "partial";

  // Nose roughly centered horizontally
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  if (Math.abs(nose.x - eyeMidX) > box.width * 0.22) return "partial";

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

  const detections = await faceapi
    .detectAllFaces(video, detector(strict))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!detections.length) return { ok: false, error: "no_face" };

  detections.sort(
    (a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height
  );
  const best = detections[0];
  const box = best.detection.box;
  const minSide = Math.min(video.videoWidth, video.videoHeight);

  const second = detections[1];
  if (second) {
    const s = second.detection.box;
    if (Math.min(s.width, s.height) > minSide * (strict ? 0.12 : 0.14)) {
      return { ok: false, error: "multiple" };
    }
  }

  const geoError = validateFaceGeometry(best, video.videoWidth, video.videoHeight, strict);
  if (geoError) return { ok: false, error: geoError };

  return {
    ok: true,
    descriptor: Array.from(best.descriptor),
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
}
