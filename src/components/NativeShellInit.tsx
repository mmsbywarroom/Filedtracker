"use client";

import { useEffect } from "react";
import { isPureNativeApp, pureNativeBridge } from "@/lib/pureNativeApp";

const APP_ROOT_PATHS = new Set(["/", "/dashboard", "/rally"]);

function isAppRoot(path: string) {
  const p = path.replace(/\/$/, "") || "/";
  return APP_ROOT_PATHS.has(p);
}

/** Pure native WebView shell: status bar inset + back exits app on main screens. */
export function NativeShellInit() {
  useEffect(() => {
    if (!isPureNativeApp()) return;

    document.body.classList.add("pure-native-app");
    document.documentElement.style.setProperty("--status-bar-height", "28px");

    const onPopState = () => {
      /* allow normal history */
    };
    window.addEventListener("popstate", onPopState);

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
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("ft-native-back", onBack);
    };
  }, []);

  return null;
}
