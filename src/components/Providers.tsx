"use client";

import { LangProvider } from "@/lib/i18n";
import { CapacitorInit } from "@/components/CapacitorInit";
import { NativeShellInit } from "@/components/NativeShellInit";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <CapacitorInit />
      <NativeShellInit />
      {children}
    </LangProvider>
  );
}
