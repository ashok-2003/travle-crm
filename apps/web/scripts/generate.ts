// `pnpm --filter @travel-crm/web generate` (Turborepo runs it before dev, build, typecheck, lint and test): writes the
// files the app is built from that git doesn't keep: they come from other packages, or are bundled from our source.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brand } from "@travel-crm/brand";
import { brandCss } from "./brand-css.js";
import { copyBrandIcons } from "./brand-icons.js";
import { copyCustomerFonts } from "./customer-fonts.js";
import { buildServiceWorker } from "./service-worker.js";

const appDirectory = path.resolve(import.meta.dirname, "..");

await mkdir(path.join(appDirectory, "src/generated"), { recursive: true });
await writeFile(path.join(appDirectory, "src/generated/brand.css"), brandCss(brand.colours));
const icons = await copyBrandIcons(path.join(appDirectory, "public/icons"));
const fonts = await copyCustomerFonts(path.join(appDirectory, "public/fonts"));
await buildServiceWorker(appDirectory);
console.log(
  `Wrote src/generated/brand.css, ${String(icons.length)} icons in public/icons, ${String(fonts.length)} fonts in public/fonts, and public/sw.js`,
);
