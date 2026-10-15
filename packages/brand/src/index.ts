// Public API of @travel-crm/brand: the product's name, colours, fonts, contacts and icon list. Plain data, so the
// web app can use it in the browser; the logo files' paths are Node-only, at @travel-crm/brand/files.
export { brand, type Brand, type StatusColour } from "./brand.js";
export { pwaIcons, type PwaIcon } from "./icons.js";
