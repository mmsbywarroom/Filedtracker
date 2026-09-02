"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/** Native app: status bar below content + safe-area for headers. */
export function CapacitorInit() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    document.body.classList.add("capacitor-native");

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setBackgroundColor({ color: "#0A1628" });
        await StatusBar.setStyle({ style: Style.Light });
        const info = await StatusBar.getInfo().catch(() => null);
        const h = info?.height && info.height > 0 ? info.height : 28;
        document.documentElement.style.setProperty("--status-bar-height", `${h}px`);
      } catch {
        document.documentElement.style.setProperty("--status-bar-height", "28px");
      }

      try {
        const { App } = await import("@capacitor/app");
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            window.dispatchEvent(new CustomEvent("ft-app-resume"));
          }
        });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return null;
}
