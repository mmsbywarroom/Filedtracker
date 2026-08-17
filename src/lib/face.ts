"use client";

import * as faceapi from "face-api.js";

let loaded = false;
let loading: Promise<void> | null = null;

export async function loadFaceModels() {
  if (loaded) return;
  if (loading) return loading;
  const url = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
  loading = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(url),
    faceapi.nets.faceLandmark68Net.loadFromUri(url),
    faceapi.nets.faceRecognitionNet.loadFromUri(url),
  ]).then(() => {
    loaded = true;
    loading = null;
  });
  return loading;
}

const detector = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });

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

  // Allow ~1.5–2m on a phone selfie cam; reject tiny background faces.
  if (faceSide < minSide * 0.08) return { ok: false, error: "too_far" };

  const second = detections[1];
  if (second && Math.min(second.box.width, second.box.height) > minSide * 0.14) {
    return { ok: false, error: "multiple" };
  }

  const pad = 0.28;
  const x = Math.max(0, best.box.x - best.box.width * pad);
  const y = Math.max(0, best.box.y - best.box.height * pad);
  const w = Math.min(video.videoWidth - x, best.box.width * (1 + pad * 2));
  const h = Math.min(video.videoHeight - y, best.box.height * (1 + pad * 2));

  const crop = document.createElement("canvas");
  crop.width = 224;
  crop.height = 224;
  const ctx = crop.getContext("2d");
  if (!ctx) return { ok: false, error: "no_face" };
  ctx.drawImage(video, x, y, w, h, 0, 0, 224, 224);

  const detail = await faceapi.detectSingleFace(crop, detector()).withFaceLandmarks().withFaceDescriptor();
  if (!detail) return { ok: false, error: "no_face" };

  return {
    ok: true,
    descriptor: Array.from(detail.descriptor),
    box: { x: best.box.x, y: best.box.y, width: best.box.width, height: best.box.height },
  };
}
