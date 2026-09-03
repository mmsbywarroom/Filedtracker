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

/** Extract face-api 128-d descriptor from a JPEG/PNG data URL or raw base64. */
export async function describeFaceFromImage(image: string): Promise<{
  ok: true;
  descriptor: number[];
  samples: number[][];
} | { ok: false; error: string }> {
  try {
    await loadModels();
    const buf = parseDataUrl(image);
    if (buf.length < 500) return { ok: false, error: "Image too small." };

    const img = await loadImage(buf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const det = await faceapi
      .detectSingleFace(canvas as unknown as HTMLCanvasElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) return { ok: false, error: "No face detected. Face the camera and try again." };

    const descriptor = Array.from(det.descriptor);
    return { ok: true, descriptor, samples: [descriptor] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Face processing failed.";
    return { ok: false, error: msg };
  }
}
