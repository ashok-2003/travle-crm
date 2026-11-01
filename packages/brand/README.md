# @travel-crm/brand

The product's own identity (spec section 10): name, colours, fonts, contacts and logo. One source of truth.

    import { brand } from "@travel-crm/brand";
    import { brandAssets } from "@travel-crm/brand/files"; // Node only
    brand.productName; // "Veeper AI"
    brand.colours.money; // "#034f46"
    brandAssets.logo; // absolute path to assets/logo.svg

- Code reads the product name only through this package. `test/product-name.test.ts` fails if `brand.productName`
  or `brand.shortName` appears in any file outside `packages/brand/` and `docs/` (it runs in `pnpm check`).
- `assets/logo.svg` (warm white on ink) and `assets/logo-dark.svg` (ink on warm white, for dark surfaces) are
  Veeper AI's mark (the owner, 2026-11-01): six rounded petals around an open centre, drawn with paths only; the name
  beside it reads "Veeper" in the text colour and "AI" in grey. Other packages can import them as `@travel-crm/brand/assets/<file>`.
- The main entry is plain data, safe in the browser (`test/browser-safe.test.ts`). `brandAssets`, the logo files'
  absolute paths, is Node-only and comes from `@travel-crm/brand/files`.
- `pnpm --filter @travel-crm/brand build` renders the icons from `assets/logo.svg` into `dist/icons`: `favicon.svg`,
  `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and
  `icon-maskable-512.png`. `pwaIcons` lists the manifest's icons for the web app (plan 5), which serves them under
  `/icons/`. The renderer (`scripts/render-icons.ts`, using `@resvg/resvg-js`) runs at build time only.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
