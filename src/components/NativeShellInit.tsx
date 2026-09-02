"use client";

import { useEffect } from "react";
import { isPureNativeApp, pureNativeBridge } from "@/lib/pureNativeApp";

const APP_ROOT_PATHS = new Set(["/", "/dashboard", "/rally"]);

function isAppRoot(path: string) {
  const p = path.replace(/\/$/, "") || "/";
  return APP_ROOT_PATHS.has(p);
}

function applyNativeInsets() {
  const bridge = pureNativeBridge();
  if (!bridge) return;
  try {
    const top = bridge.getStatusBarHeightPx?.() ?? 0;
    const bottom = bridge.getNavigationBarHeightPx?.() ?? 0;
    if (top > 0) {
      document.documentElement.style.setProperty("--status-bar-height", `${top}px`);
    }
    if (bottom > 0) {
      document.documentElement.style.setProperty("--navigation-bar-height", `${bottom}px`);
    }
  } catch {
    /* bridge not ready */
  }
}

/** Pure native WebView shell: status bar inset + back exits app on main screens. */
export function NativeShellInit() {
  useEffect(() => {
    if (!isPureNativeApp()) return;

    document.body.classList.add("pure-native-app");
    applyNativeInsets();
    window.setTimeout(applyNativeInsets, 300);
    window.setTimeout(applyNativeInsets, 1200);

    const onResume = () => applyNativeInsets();
    window.addEventListener("ft-app-resume", onResume);

    const onBack = () => {
      if (isAppRoot(window.location.pathname)) {
        pureNativeBridge()?.exitApp();
      } else if (window.history.length > 1) {
        window.history.back();
      } else {
        pureNativeBridge()?.exitApp();
      }
    };

    window.addEventListener("ft-native-back", onBack);

    return () => {
      window.removeEventListener("ft-app-resume", onResume);
      window.removeEventListener("ft-native-back", onBack);
    };
  }, []);

  return null;
}
