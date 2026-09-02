"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FaceCapture } from "@/components/FaceCapture";

declare global {
  interface Window {
    NativeFaceBridge?: {
      onFaceCaptured: (descriptorJson: string, image: string) => void;
      onFaceCancel: () => void;
      onFaceError: (message: string) => void;
    };
  }
}

function NativeFaceInner() {
  const params = useSearchParams();
  const mode = params.get("mode") === "register" ? "register" : "verify";
  const turban = params.get("turban") === "1";

  return (
    <main className="min-h-screen bg-sand p-4">
      <FaceCapture
        mode={mode}
        turbanMode={turban}
        actionLabel={mode === "register" ? "Save face" : "Confirm"}
        onCapture={async (descriptor, image, samples) => {
          if (window.NativeFaceBridge?.onFaceCaptured) {
            const payload =
              mode === "register" && samples?.length
                ? JSON.stringify({ descriptor, samples })
                : JSON.stringify(descriptor);
            window.NativeFaceBridge.onFaceCaptured(payload, image);
            return;
          }
          throw new Error("Native bridge not available.");
        }}
      />
      <button
        type="button"
        className="mt-4 w-full rounded-xl py-3 text-sm text-navy/50"
        onClick={() => window.NativeFaceBridge?.onFaceCancel?.()}
      >
        Cancel
      </button>
    </main>
  );
}

export default function NativeFacePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-sand p-6 text-sm text-navy/60">Loading camera…</main>}>
      <NativeFaceInner />
    </Suspense>
  );
}
