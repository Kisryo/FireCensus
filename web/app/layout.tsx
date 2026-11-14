import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Metadata } from "next";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "FireCensus: harmonized MODIS + VIIRS fire counts",
  description:
    "Counting the fires every satellite missed. Capture-recapture harmonization of MODIS and VIIRS active-fire hotspots for Southeast Asia, 2002–2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Nav />
        {children}
      </body>
    </html>
  );
}
