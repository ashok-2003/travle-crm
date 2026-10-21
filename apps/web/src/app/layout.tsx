// The root layout: the document, its language, the brand's fonts and styles, and the toast region.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand } from "@travel-crm/brand";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@/components/ui/sonner";
import { DataProviders } from "@/data/providers";
import { clientMessages } from "@/i18n/messages";
import { ServiceWorkerRegistration } from "@/pwa/service-worker-registration";
import { fontVariables } from "./fonts";
// Indian scripts (DESIGN.md section 3). Each file's faces carry a unicode-range, so a browser downloads one only when
// a page shows that script.
import "@fontsource-variable/noto-sans-devanagari/wght.css";
import "@fontsource-variable/noto-sans-bengali/wght.css";
import "@fontsource-variable/noto-sans-tamil/wght.css";
import "@fontsource-variable/noto-sans-telugu/wght.css";
import "@fontsource-variable/noto-sans-gujarati/wght.css";
import "@fontsource-variable/noto-sans-kannada/wght.css";
import "@fontsource-variable/noto-sans-malayalam/wght.css";
import "@fontsource-variable/noto-sans-gurmukhi/wght.css";
import "@fontsource-variable/noto-serif-devanagari/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline,
  applicationName: brand.productName,
  // The brand's icons, which scripts/generate.ts copies to public/icons.
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "32x32" },
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: brand.colours.canvas,
  width: "device-width",
  initialScale: 1,
  // Content may sit under the notch and home bar; the shell pads by env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>
        <NextIntlClientProvider messages={clientMessages}>
          <DataProviders>{children}</DataProviders>
          <Toaster />
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
