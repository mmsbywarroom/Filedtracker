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

const detector = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

export type FaceScanError = "no_face" | "too_far" | "multiple";

export type FaceScan =
  | { ok: true; descriptor: number[]; box: { x: number; y: number; width: number; height: number } }
  | { ok: false; error: FaceScanError };

export async function scanFace(video: HTMLVideoElement): Promise<FaceScan> {
  await loadFaceModels();
  if (!video.videoWidth) return { ok: false, error: "no_face" };

  const detections = await faceapi.detectAllFaces(video, detector());
  if (!detections.length) return { ok: false, error: "no_face" };

  detections.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  const best = detections[0];
  const minSide = Math.min(video.videoWidth, video.videoHeight);
  const faceSide = Math.min(best.box.width, best.box.height);
  if (faceSide < minSide * 0.1) return { ok: false, error: "too_far" };

  const second = detections[1];
  if (second && Math.min(second.box.width, second.box.height) > minSide * 0.14) {
    return { ok: false, error: "multiple" };
  }

  const detail = await faceapi
    .detectSingleFace(video, detector())
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detail) return { ok: false, error: "no_face" };

  return {
    ok: true,
    descriptor: Array.from(detail.descriptor),
    box: { x: best.box.x, y: best.box.y, width: best.box.width, height: best.box.height },
  };
}
