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

// The icon files carry a version in their names: Chrome on Android only updates an installed app's icon when the
// icon's address changes, so a changed mark gets a new version (v2: the six petals of 2026-11-01).
export const pwaIcons: readonly PwaIcon[] = [
  { src: "/icons/icon-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/** An iPhone screen size the startup image is drawn for: pixels of the picture and the device's pixel ratio. */
export interface AppleStartupScreen {
  width: number;
  height: number;
  pixelRatio: number;
}

/** The common iPhone portrait screens, from the 4.7 inch models to the 6.7 inch ones. */
export const appleStartupScreens: readonly AppleStartupScreen[] = [
  { width: 750, height: 1334, pixelRatio: 2 },
  { width: 828, height: 1792, pixelRatio: 2 },
  { width: 1125, height: 2436, pixelRatio: 3 },
  { width: 1170, height: 2532, pixelRatio: 3 },
  { width: 1179, height: 2556, pixelRatio: 3 },
  { width: 1242, height: 2688, pixelRatio: 3 },
  { width: 1284, height: 2778, pixelRatio: 3 },
  { width: 1290, height: 2796, pixelRatio: 3 },
];

/** The file name of a screen's startup image, written by the build into dist/icons. */
export function appleStartupFileName(screen: AppleStartupScreen): string {
  return `apple-startup-${String(screen.width)}x${String(screen.height)}-v2.png`;
}

export interface AppleStartupImage {
  /** Where the web app serves the picture. */
  url: string;
  /** The media query that picks it: only the screen it was drawn for. */
  media: string;
}

/** For `appleWebApp.startupImage`: iOS shows the picture whose media query fits the screen while the app opens. */
export const appleStartupImages: readonly AppleStartupImage[] = appleStartupScreens.map((screen) => ({
  url: `/icons/${appleStartupFileName(screen)}`,
  media:
    `(device-width: ${String(screen.width / screen.pixelRatio)}px) and (device-height: ${String(screen.height / screen.pixelRatio)}px)` +
    ` and (-webkit-device-pixel-ratio: ${String(screen.pixelRatio)}) and (orientation: portrait)`,
}));
