import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// The Montreal Weekend Board's three faces: Newsreader for text, Archivo (at a chosen width) for
// headings and the interface, Plex Mono for times and small print.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], display: "swap" });

export const metadata: Metadata = {
  title: "Road Trip",
  description: "What is on along the road, for the times you will be passing through.",
};

// No maximum-scale: pinch-zoom stays available.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#22302A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${archivo.variable} ${plexMono.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
