// The icons the build generates from the logo (scripts/generate-icons.ts), as data for the PWA manifest (plan 5).
// Only data here: rendering is a build-time tool and never ships.

export interface PwaIcon {
  /** Where the web app serves the file: the build writes dist/icons/<file>, served under /icons/. */
  src: string;
  sizes: string;
  type: "image/png";
  /** "maskable" icons fill a square the device crops to its own shape; "any" icons are shown as drawn. */
  purpose: "any" | "maskable";
}

export const pwaIcons: readonly PwaIcon[] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
