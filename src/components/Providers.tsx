"use client";

import { LangProvider } from "@/lib/i18n";
import { CapacitorInit } from "@/components/CapacitorInit";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <CapacitorInit />
      {children}
    </LangProvider>
  );
}
