// The login's state (8.4): a signed value that binds the organization, the member and an expiry, so a login started by
// one person in one agency cannot be finished by another, and a stale one is refused. It is single-use: its nonce is
// consumed in the rate-limit counters. Nothing about it is stored beyond that counter.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RateLimiter } from "../rate-limits/index.js";

export interface ConnectState {
  organizationId: string;
  userId: string;
  /** The Page being connected again, or null for a new connection. */
  reconnectPageRowId: string | null;
  expiresAt: Date;
}

interface Payload {
  o: string;
  u: string;
  r: string | null;
  x: number;
  n: string;
}

const sign = (secret: string, encoded: string) => createHmac("sha256", secret).update(`meta-login:${encoded}`).digest();

/** A state for this login, valid until `expiresAt`. */
export function makeConnectState(secret: string, state: ConnectState): string {
  const payload: Payload = {
    o: state.organizationId,
    u: state.userId,
    r: state.reconnectPageRowId,
    x: state.expiresAt.getTime(),
    n: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(secret, encoded).toString("base64url")}`;
}

export interface ReadState extends ConnectState {
  nonce: string;
}

/** The state's contents, or null for anything not signed with this secret, malformed or expired. */
export function readConnectState(secret: string, text: string, now: Date): ReadState | null {
  const parts = text.split(".");
  const [encoded, signature] = parts;
  if (parts.length !== 2 || !encoded || !signature) return null;
  const given = Buffer.from(signature, "base64url");
  const expected = sign(secret, encoded);
  if (given.byteLength !== expected.byteLength || !timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const { o, u, r, x, n } = payload as Record<string, unknown>;
  if (typeof o !== "string" || typeof u !== "string" || typeof x !== "number" || typeof n !== "string") return null;
  if (r !== null && typeof r !== "string") return null;
  if (x <= now.getTime()) return null;
  return { organizationId: o, userId: u, reconnectPageRowId: r, expiresAt: new Date(x), nonce: n };
}

/** Consumes the nonce: true the first time, false for a state used again. */
export async function consumeNonce(limiter: RateLimiter, nonce: string, now: Date): Promise<boolean> {
  const hit = await limiter.hit(`meta-login:${nonce}`, { limit: 1, windowSeconds: 3600 }, now);
  return hit.allowed;
}
