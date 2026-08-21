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

/** Slightly looser detector for low-end phone cameras */
const detector = () =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });

export type FaceScanError = "no_face" | "too_far" | "multiple";

export type FaceScan =
  | { ok: true; descriptor: number[]; box: { x: number; y: number; width: number; height: number } }
  | { ok: false; error: FaceScanError };

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

export async function scanFace(video: HTMLVideoElement): Promise<FaceScan> {
  await loadFaceModels();
  if (!video.videoWidth) return { ok: false, error: "no_face" };

  // One pass: detect + landmarks + descriptor (avoids mismatched second detection)
  const detections = await faceapi
    .detectAllFaces(video, detector())
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!detections.length) return { ok: false, error: "no_face" };

  detections.sort((a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height);
  const best = detections[0];
  const box = best.detection.box;
  const minSide = Math.min(video.videoWidth, video.videoHeight);
  const faceSide = Math.min(box.width, box.height);
  // Require face to fill a bit of the frame (phone selfies vary a lot)
  if (faceSide < minSide * 0.12) return { ok: false, error: "too_far" };

  const second = detections[1];
  if (second) {
    const s = second.detection.box;
    if (Math.min(s.width, s.height) > minSide * 0.14) {
      return { ok: false, error: "multiple" };
    }
  }

  return {
    ok: true,
    descriptor: Array.from(best.descriptor),
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
}
