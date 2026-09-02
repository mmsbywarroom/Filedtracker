"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const APP_ROOT_PATHS = new Set(["/", "/dashboard", "/rally"]);

function isAppRoot(path: string) {
  const p = path.replace(/\/$/, "") || "/";
  return APP_ROOT_PATHS.has(p);
}

/** Native app: status bar inset + Android back gesture exits app on main screens. */
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
        await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            window.dispatchEvent(new CustomEvent("ft-app-resume"));
          }
        });
        await App.addListener("backButton", ({ canGoBack }) => {
          const path = window.location.pathname;
          if (isAppRoot(path)) {
            void App.exitApp();
            return;
          }
          if (canGoBack && window.history.length > 1) {
            window.history.back();
            return;
          }
          void App.exitApp();
        });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return null;
}
