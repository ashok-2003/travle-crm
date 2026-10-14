# @travel-crm/brand

The product's own identity (spec section 10): name, colours, fonts and contacts. One source of truth.

    import { brand } from "@travel-crm/brand";
    brand.productName; // "Travel Agency OS"
    brand.colours.money; // "#034f46"

- Code reads the product name only through this package.
- An organization's own logo, colours and terms are settings stored per organization, not brand values.
