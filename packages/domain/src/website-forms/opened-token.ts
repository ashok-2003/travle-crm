// The opened token (W37): the form's id and the moment its page opened, signed with HMAC-SHA256 under a key derived from the
// auth secret with a fixed label, so no new secret is set. It proves a visitor had the page open for a moment, nothing more.
import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "../kernel/index.js";
import { formLimits } from "./limits.js";

const KEY_LABEL = "travel-crm/website-form/opened-token/v1";
const HOUR_MS = 3_600_000;

/** The token key, derived from the auth secret; the secret itself never signs anything. */
export function formTokenKey(authSecret: string): Buffer {
  return createHmac("sha256", authSecret).update(KEY_LABEL).digest();
}

const macOf = (key: Buffer, signed: string) => createHmac("sha256", key).update(signed).digest("base64url");

/** `<form id>.<milliseconds>.<signature>`. */
export function signOpenedToken(key: Buffer, formId: string, at: Date): string {
  const signed = `${formId}.${String(at.getTime())}`;
  return `${signed}.${macOf(key, signed)}`;
}

const expired = () => new DomainError("VALIDATION", "FORM_EXPIRED", "This page was opened too long ago");
const tooFast = () =>
  new DomainError("VALIDATION", "FORM_TOO_FAST", "Sent less than two seconds after the page opened");

/** Refuses an unreadable, tampered or other form's token (FORM_EXPIRED), a young one (FORM_TOO_FAST) or an old one. */
export function checkOpenedToken(key: Buffer, token: string, formId: string, now: Date): void {
  const parts = token.split(".");
  const [tokenFormId, milliseconds, mac] = parts;
  if (parts.length !== 3 || tokenFormId === undefined || milliseconds === undefined || mac === undefined)
    throw expired();
  const expectedMac = Buffer.from(macOf(key, `${tokenFormId}.${milliseconds}`));
  const givenMac = Buffer.from(mac);
  if (expectedMac.length !== givenMac.length || !timingSafeEqual(expectedMac, givenMac)) throw expired();
  if (tokenFormId !== formId || !/^\d{1,16}$/.test(milliseconds)) throw expired();
  const age = now.getTime() - Number(milliseconds);
  if (age > formLimits.tokenMaxAgeHours * HOUR_MS) throw expired();
  if (age < formLimits.minFillSeconds * 1000) throw tooFast();
}
