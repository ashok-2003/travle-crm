// Asks the api for an agency's package page or its list of packages, from the web server (release 7b). Plain fetch, never tRPC,
// and never cached by Next: a page published, changed or taken down shows at once; the api marks its answer cacheable for a
// minute for a CDN in front of it. The answer is one of the page's states: it, "not available" (one answer whether the page was
// never there, was unpublished or the agency turned its pages off), or a failure to reach the api.
import {
  publicPackageAnswer,
  publicPackageListAnswer,
  type PublicPackage,
  type PublicPackageList,
} from "@travel-crm/contracts/package-pages";
import { headers } from "next/headers";
import { cache } from "react";

export type Loaded<Page> = { state: "ready"; page: Page } | { state: "not-found" } | { state: "failed" };

/** The agency's sign-in code as an address carries it, and a slug: checked before they reach a URL. */
const CODE = /^[A-Za-z0-9]{3,12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Where the web server reaches the api: API_ORIGIN when it is set (development, the journeys, the Docker product), else the
 * address the visitor used, which a deployment routes /api/* from. The api never needs to be public under another name.
 */
async function apiOrigin(): Promise<string> {
  const configured = process.env.API_ORIGIN;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  const asked = await headers();
  const host = asked.get("x-forwarded-host") ?? asked.get("host") ?? "localhost";
  const protocol = asked.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

async function fetchAnswer(path: string): Promise<unknown> {
  const asked = await headers();
  const address = asked.get("x-forwarded-for");
  const response = await fetch(`${await apiOrigin()}/api/public/packages/${path}`, {
    cache: "no-store",
    // The visitor's address, so the api's per-address limits count them and not this server.
    headers: address === null ? {} : { "x-forwarded-for": address },
  });
  if (response.status === 404) return { available: false };
  if (!response.ok) throw new Error(`The api answered ${String(response.status)}`);
  return response.json();
}

/** Once for each request, so a page's metadata and its body share one answer. */
export const loadPackagePage = cache(async (code: string, slug: string): Promise<Loaded<PublicPackage>> => {
  if (!CODE.test(code) || !SLUG.test(slug)) return { state: "not-found" };
  try {
    const answer = publicPackageAnswer.safeParse(await fetchAnswer(`${code}/${slug}`));
    if (!answer.success) return { state: "failed" };
    return answer.data.available ? { state: "ready", page: answer.data.page } : { state: "not-found" };
  } catch {
    return { state: "failed" };
  }
});

export const loadPackageList = cache(async (code: string): Promise<Loaded<PublicPackageList>> => {
  if (!CODE.test(code)) return { state: "not-found" };
  try {
    const answer = publicPackageListAnswer.safeParse(await fetchAnswer(code));
    if (!answer.success) return { state: "failed" };
    return answer.data.available ? { state: "ready", page: answer.data.page } : { state: "not-found" };
  } catch {
    return { state: "failed" };
  }
});
