"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/nativeBackgroundLocation";

/** Client-only native detection (WebView bridge / user-agent not available during SSR). */
export function useClientNativeApp() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}
