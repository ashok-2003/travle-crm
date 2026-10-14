// Keys for roles an owner creates: readable where the name allows, unique by a random suffix.
import { randomBytes } from "node:crypto";

/**
 * "Senior sales" → "senior-sales-3f9a2c". Names with no Latin letters or digits, such as "बिक्री", become
 * "role-3f9a2c". The suffix keeps custom keys apart from each other and from the starter roles' keys.
 */
export function roleKeyFor(name: string, suffix = randomBytes(3).toString("hex")): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  const start = /^[a-z]/.test(slug) ? slug : slug === "" ? "role" : `role-${slug}`;
  return `${start}-${suffix}`;
}
