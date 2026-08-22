import type { Metadata, Viewport } from "next";
import { Noto_Sans_Gurmukhi, Plus_Jakarta_Sans } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

const gurmukhi = Noto_Sans_Gurmukhi({
  subsets: ["gurmukhi"],
  weight: ["400", "600", "700"],
  variable: "--font-pa",
});

export const metadata: Metadata = {
  title: "Attendance — Aam Aadmi Party",
  description: "Aam Aadmi Party attendance with OTP, face punch, and travel footprint.",
  icons: {
    icon: "/aap-logo.png",
    apple: "/aap-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0A1628",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${gurmukhi.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
