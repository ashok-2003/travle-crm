// Rate limits for the public routes (share links, webhooks): Hono middleware over the domain's Postgres-backed limiter.
import { BlockList, isIP } from "node:net";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { MiddlewareHandler } from "hono";

export interface RateLimitOptions {
  limiter: RateLimiter;
  /** Names the limit, e.g. "share-links": each name counts separately. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** The client's address, from clientAddressFrom(...), or null when none can be trusted. */
  clientAddress: (request: Request) => string | null;
}

let warnedAboutMissingAddress = false;

/** Lets a test see the once-per-process warning again. */
export function resetMissingAddressWarning(): void {
  warnedAboutMissingAddress = false;
}

/** Counts every request per limit name and client address; over the limit, answers 429 with Retry-After. */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const rule = { limit: options.limit, windowSeconds: options.windowSeconds };
  return async (c, next) => {
    // Without an address, every such request shares one bucket: an unknown client is limited, never let through.
    const clientAddress = options.clientAddress(c.req.raw);
    if (clientAddress === null && !warnedAboutMissingAddress) {
      warnedAboutMissingAddress = true;
      console.warn(
        `Rate limit "${options.name}": a request has no trusted client address (the address header is missing or ` +
          "untrusted). Check the load balancer: every such request shares one bucket.",
      );
    }
    const address = clientAddress ?? "no-address";
    const result = await options.limiter.hit(`${options.name}:${address}`, rule);
    c.header("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(
        { code: "RATE_LIMITED", reason: "RATE_LIMITED", message: "Too many requests. Try again in a little while." },
        429,
      );
    }
    await next();
  };
}

export interface ClientAddressSettings {
  /** Headers the load balancer puts the client's address in (AUTH_IP_ADDRESS_HEADERS); the first present is read. */
  headerNames: readonly string[];
  /** IPs and CIDR ranges of the proxies in front of the api (AUTH_TRUSTED_PROXIES). */
  trustedProxies: readonly string[];
}

/** A forwarded hop's address, with IPv4-mapped IPv6 written as the IPv4 address it is. */
interface Hop {
  address: string;
  family: "ipv4" | "ipv6";
}

/**
 * The eight groups of an IPv6 address. The URL parser gives its shortest form, refuses zone ids, and writes a dotted
 * tail in hex.
 */
function ipv6Groups(address: string): number[] | null {
  let host: string;
  try {
    host = new URL(`http://[${address}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const groups = (part: string) => (part === "" ? [] : part.split(":").map((group) => Number.parseInt(group, 16)));
  const [head = "", tail] = host.split("::");
  if (tail === undefined) return groups(head);
  const left = groups(head);
  const right = groups(tail);
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

function parseHop(text: string): Hop | null {
  if (isIP(text) === 4) return { address: text, family: "ipv4" };
  if (isIP(text) !== 6) return null;
  const groups = ipv6Groups(text);
  if (groups?.length !== 8) return null;
  const [, , , , , marker = 0, high = 0, low = 0] = groups;
  if (groups.slice(0, 5).every((group) => group === 0) && marker === 0xffff) {
    return { address: [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."), family: "ipv4" };
  }
  return { address: new URL(`http://[${text}]`).hostname.slice(1, -1), family: "ipv6" };
}

/** What the rate limit counts: an IPv4 address, or an IPv6 address's /64, so one host can't rotate addresses in it. */
function countedAddress(hop: Hop): string {
  if (hop.family === "ipv4") return hop.address;
  const network = (ipv6Groups(hop.address) ?? []).slice(0, 4).map((group) => group.toString(16));
  return new URL(`http://[${network.join(":")}::]`).hostname.slice(1, -1);
}

/** The trusted proxies as a BlockList. A malformed entry throws: the environment check should have refused it. */
function trustedProxyList(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = "", prefix, ...rest] = entry.split("/");
    const hop = parseHop(address);
    const maximumPrefix = hop?.family === "ipv4" ? 32 : 128;
    const badPrefix = prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maximumPrefix);
    if (!hop || badPrefix || rest.length > 0) {
      throw new RangeError(`Not an IP address or CIDR range: ${JSON.stringify(entry)}`);
    }
    if (prefix === undefined) list.addAddress(hop.address, hop.family);
    else list.addSubnet(hop.address, Number(prefix), hop.family);
  }
  return list;
}

/**
 * Reads the client's address the way Better Auth does for sign-in (ADR 0006), so a client can't forge one: from the
 * first configured header that is present, split on commas. Unlike Better Auth it never falls through to the next
 * header when that one holds nothing usable (it gives null), so a client can't choose which header is read. With
 * trusted proxies, the client is the first address from the right that isn't one of them (the leftmost values are
 * whatever the client sent). Without them, only a header holding exactly one address is believed. A malformed
 * address, or none left, gives null, which the rate limit counts in one shared bucket. IPv6 addresses come back as
 * their /64 network.
 */
export function clientAddressFrom(settings: ClientAddressSettings): (request: Request) => string | null {
  const trusted = trustedProxyList(settings.trustedProxies);
  const behindProxies = settings.trustedProxies.length > 0;
  return (request) => {
    const header = settings.headerNames.find((name) => request.headers.has(name));
    if (header === undefined) return null;
    const values = (request.headers.get(header) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "");
    if (!behindProxies) {
      const only = values.length === 1 && values[0] !== undefined ? parseHop(values[0]) : null;
      return only ? countedAddress(only) : null;
    }
    for (const value of values.toReversed()) {
      const hop = parseHop(value);
      if (!hop) return null;
      if (!trusted.check(hop.address, hop.family)) return countedAddress(hop);
    }
    return null;
  };
}
