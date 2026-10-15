# @travel-crm/brand

The product's own identity (spec section 10): name, colours, fonts, contacts and logo. One source of truth.

    import { brand } from "@travel-crm/brand";
    import { brandAssets } from "@travel-crm/brand/files"; // Node only
    brand.productName; // "Travel Agency OS"
    brand.colours.money; // "#034f46"
    brandAssets.logo; // absolute path to assets/logo.svg

- Code reads the product name only through this package. `test/product-name.test.ts` fails if `brand.productName`
  or `brand.shortName` appears in any file outside `packages/brand/` and `docs/` (it runs in `pnpm check`).
- `assets/logo.svg` (for light surfaces) and `assets/logo-dark.svg` (for dark ones) are placeholder marks drawn with
  paths only, until a designed logo replaces them. Other packages can import them as `@travel-crm/brand/assets/<file>`.
- The main entry is plain data, safe in the browser (`test/browser-safe.test.ts`). `brandAssets`, the logo files'
  absolute paths, is Node-only and comes from `@travel-crm/brand/files`.
- `pnpm --filter @travel-crm/brand build` renders the icons from `assets/logo.svg` into `dist/icons`: `favicon.svg`,
  `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and
  `icon-maskable-512.png`. `pwaIcons` lists the manifest's icons for the web app (plan 5), which serves them under
  `/icons/`. The renderer (`scripts/render-icons.ts`, using `@resvg/resvg-js`) runs at build time only.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
