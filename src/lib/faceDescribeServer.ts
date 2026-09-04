import path from "path";
import { createCanvas, loadImage, Image, ImageData, Canvas } from "canvas";
import * as faceapi from "face-api.js";

let patched = false;
let modelsReady: Promise<void> | null = null;

function ensureMonkeyPatch() {
  if (patched) return;
  // face-api.js expects browser canvas types; map node-canvas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);
  patched = true;
}

async function loadModels() {
  if (!modelsReady) {
    modelsReady = (async () => {
      ensureMonkeyPatch();
      const dir = path.join(process.cwd(), "public", "weights");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromDisk(dir),
        faceapi.nets.faceLandmark68Net.loadFromDisk(dir),
        faceapi.nets.faceRecognitionNet.loadFromDisk(dir),
      ]);
    })();
  }
  await modelsReady;
}

function parseDataUrl(image: string): Buffer {
  const m = /^data:image\/\w+;base64,(.+)$/i.exec(image.trim());
  const b64 = m ? m[1] : image.replace(/\s/g, "");
  return Buffer.from(b64, "base64");
}

const DETECT_TRIES: { inputSize: number; scoreThreshold: number }[] = [
  { inputSize: 320, scoreThreshold: 0.4 },
  { inputSize: 416, scoreThreshold: 0.35 },
  { inputSize: 224, scoreThreshold: 0.32 },
  { inputSize: 416, scoreThreshold: 0.28 },
];

/**
 * Extract face-api 128-d descriptor from a JPEG/PNG data URL or raw base64.
 * Retries with softer detector settings so eyes/nose/mouth still match when
 * the upper head is covered (native + web).
 */
export async function describeFaceFromImage(
  image: string,
  opts?: { relaxed?: boolean; fast?: boolean }
): Promise<{ ok: true; descriptor: number[]; samples: number[][] } | { ok: false; error: string }> {
  try {
    await loadModels();
    const buf = parseDataUrl(image);
    if (buf.length < 500) return { ok: false, error: "Image too small." };

    const img = await loadImage(buf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // fast: 1–2 detector passes (native punch already ML-Kit locked a face).
    const tries = opts?.fast
      ? DETECT_TRIES.slice(0, 2)
      : opts?.relaxed
        ? DETECT_TRIES
        : DETECT_TRIES.slice(0, 2);
    let det: faceapi.WithFaceDescriptor<
      faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>
    > | null = null;

    for (const opt of tries) {
      det =
        (await faceapi
          .detectSingleFace(
            canvas as unknown as HTMLCanvasElement,
            new faceapi.TinyFaceDetectorOptions(opt)
          )
          .withFaceLandmarks()
          .withFaceDescriptor()) || null;
      if (det) break;
    }

    if (!det) {
      return {
        ok: false,
        error: "Hold still — eyes, nose and chin clearly in the frame, then try again.",
      };
    }

    const descriptor = Array.from(det.descriptor);
    return { ok: true, descriptor, samples: [descriptor] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Face processing failed.";
    return { ok: false, error: msg };
  }
}
