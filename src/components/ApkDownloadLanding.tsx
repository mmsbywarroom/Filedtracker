"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";
import {
  IOS_TESTFLIGHT_URL,
  LATEST_NATIVE_APK,
  NATIVE_APK_VERSION,
} from "@/lib/apkDownload";
import { isAndroidBrowser, isIosBrowser } from "@/lib/clientDevice";

/** Public landing: Android APK + iOS TestFlight. No field web punch. */
export function ApkDownloadLanding() {
  const { t } = useLang();
  const [ready, setReady] = useState(false);
  const [android, setAndroid] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setAndroid(isAndroidBrowser());
    setIos(isIosBrowser());
    setReady(true);
  }, []);

  return (
    <main className="apk-landing relative min-h-screen overflow-hidden text-white">
      <div className="apk-landing__glow apk-landing__glow--a" aria-hidden />
      <div className="apk-landing__glow apk-landing__glow--b" aria-hidden />
      <div className="apk-landing__grid" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <div className={`flex items-center gap-3 ${ready ? "apk-anim-in" : "opacity-0"}`}>
          <BrandMark size={48} tone="onDark" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-bright">{t("aap")}</p>
            <p className="text-sm font-semibold text-white/90">{t("app")}</p>
          </div>
        </div>
        <div className={ready ? "apk-anim-in apk-anim-delay-1" : "opacity-0"}>
          <LangToggle />
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-6xl flex-col justify-center px-5 pb-16 pt-6 md:px-8 md:pb-24">
        <div className="max-w-xl">
          <p
            className={`mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-teal-bright ${
              ready ? "apk-anim-in apk-anim-delay-1" : "opacity-0"
            }`}
          >
            Field attendance
          </p>
          <h1
            className={`text-[clamp(2.4rem,7vw,4.25rem)] font-semibold leading-[1.05] tracking-tight ${
              ready ? "apk-anim-in apk-anim-delay-2" : "opacity-0"
            }`}
          >
            AAP
            <span className="block text-teal-bright">Attendance</span>
          </h1>
          <p
            className={`mt-5 max-w-md text-base leading-relaxed text-white/70 md:text-lg ${
              ready ? "apk-anim-in apk-anim-delay-3" : "opacity-0"
            }`}
          >
            {android ? t("landingLeadAndroid") : ios ? t("landingLeadIos") : t("landingLeadDesktop")}
          </p>

          <div
            className={`mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center ${
              ready ? "apk-anim-in apk-anim-delay-4" : "opacity-0"
            }`}
          >
            <a
              href={LATEST_NATIVE_APK}
              className="apk-cta group inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal-bright px-8 text-base font-bold text-ink transition hover:brightness-105"
            >
              <span className="apk-cta__shine" aria-hidden />
              {t("downloadApk")}
              <span className="text-xs font-semibold opacity-70">v{NATIVE_APK_VERSION}</span>
            </a>
            <a
              href={IOS_TESTFLIGHT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-8 text-base font-bold text-white transition hover:bg-white/15"
            >
              {t("downloadTestFlight")}
            </a>
          </div>

          <p
            className={`mt-4 max-w-lg text-xs leading-relaxed text-white/45 ${
              ready ? "apk-anim-in apk-anim-delay-4" : "opacity-0"
            }`}
          >
            {t("landingInstallHint")}
          </p>

          <ul
            className={`mt-10 grid max-w-lg gap-3 text-sm text-white/55 ${
              ready ? "apk-anim-in apk-anim-delay-5" : "opacity-0"
            }`}
          >
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-bright" />
              {t("landingBullet1")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-bright" />
              {t("landingBullet2")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-bright" />
              {t("landingBullet3")}
            </li>
          </ul>
        </div>

        <div
          className={`pointer-events-none absolute bottom-[12%] right-[-8%] hidden w-[min(42vw,420px)] opacity-90 md:block ${
            ready ? "apk-float" : "opacity-0"
          }`}
          aria-hidden
        >
          <div className="apk-phone relative aspect-[9/19] w-full rounded-[2.5rem] border border-white/20 bg-gradient-to-b from-[#1a3a6e]/80 to-[#0A1628]/90 p-3 shadow-float backdrop-blur-sm">
            <div className="flex h-full flex-col items-center justify-center rounded-[2rem] bg-[#0d1f3c]/90 px-6 text-center">
              <BrandMark size={72} tone="onDark" className="mb-4" />
              <p className="text-xs uppercase tracking-[0.2em] text-teal-bright">Native app</p>
              <p className="mt-2 text-lg font-semibold">Punch · Track · Flag</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
