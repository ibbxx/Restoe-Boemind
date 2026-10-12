import type { Metadata } from "next";
import { ReactGrabLoader } from "@/components/dev/react-grab-loader";

import "./globals.css";

export const metadata: Metadata = {
  title: "RBI · Analisis Harga Satuan",
  description:
    "lembar kerja proyek dan evaluasi pemasok berbasis spreadsheet.",
  icons: { icon: "/rbi-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen">
        {children}
        {process.env.NODE_ENV === "development" ? <ReactGrabLoader /> : null}
      </body>
    </html>
  );
}
