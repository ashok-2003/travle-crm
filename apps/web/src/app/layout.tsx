// The root layout: the document, its language and the global styles.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@travel-crm/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
