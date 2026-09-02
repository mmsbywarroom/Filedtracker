"use client";

import { LangProvider } from "@/lib/i18n";
import { NativeShellInit } from "@/components/NativeShellInit";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <NativeShellInit />
      {children}
    </LangProvider>
  );
}
