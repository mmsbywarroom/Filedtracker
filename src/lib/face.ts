"use client";

import * as faceapi from "face-api.js";

let loaded = false;

export async function loadFaceModels() {
  if (loaded) return;
  const url = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(url),
    faceapi.nets.faceLandmark68Net.loadFromUri(url),
    faceapi.nets.faceRecognitionNet.loadFromUri(url),
  ]);
  loaded = true;
}

export async function getFaceDescriptor(video: HTMLVideoElement) {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return Array.from(detection.descriptor);
}
