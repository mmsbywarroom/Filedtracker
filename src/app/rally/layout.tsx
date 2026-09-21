import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Rally check-in | Aam Aadmi Party",
  description: "Rally photo check-in, people count, and journey ETA.",
  applicationName: "AAP Rally",
  appleWebApp: {
    capable: true,
    title: "AAP Rally",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0A1628",
};

export default function RallyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
