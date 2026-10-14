# @travel-crm/brand

The product's own identity (spec section 10): name, colours, fonts, contacts and logo. One source of truth.

    import { brand, brandAssets } from "@travel-crm/brand";
    brand.productName; // "Travel Agency OS"
    brand.colours.money; // "#034f46"
    brandAssets.logo; // absolute path to assets/logo.svg

- Code reads the product name only through this package. `test/product-name.test.ts` fails if `brand.productName`
  or `brand.shortName` appears in any file outside `packages/brand/` and `docs/` (it runs in `pnpm check`).
- `assets/logo.svg` (for light surfaces) and `assets/logo-dark.svg` (for dark ones) are placeholder marks drawn with
  paths only, until a designed logo replaces them. Other packages can import them as `@travel-crm/brand/assets/<file>`.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
