// The sign-in and account calls: JSON POSTs to /api/auth on the app's own address, reading only what screens need.
import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "@/data/auth-client";

function answering(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status, headers })));
}

/** The JSON body of the fetch call made. */
function sentBody(fetch: ReturnType<typeof answering>): unknown {
  return JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
}

describe("authClient", () => {
  it("posts JSON to the same origin, with the cookies", async () => {
    const fetch = answering(200, { redirect: false, token: "t", user: { email: "x@no-email.invalid" } });
    await createAuthClient(fetch).signInWithEmail({ email: "asha@example.in", password: "secret-password" });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(sentBody(fetch)).toEqual({ email: "asha@example.in", password: "secret-password" });
  });

  it("keeps nothing of Better Auth's user, so a placeholder email can't leak to a screen", async () => {
    const fetch = answering(200, { token: "t", user: { email: "sharma-ravi@no-email.invalid" } });
    const result = await createAuthClient(fetch).signInWithCode({ orgCode: "SHARMA", username: "ravi", password: "p" });
    expect(result).toEqual({ ok: true, data: { twoFactorRequired: false } });
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/auth/sign-in/org");
  });

  it("says when a two-factor code must follow", async () => {
    const result = await createAuthClient(answering(200, { twoFactorRedirect: true })).signInWithEmail({
      email: "a@b.in",
      password: "p",
    });
    expect(result).toEqual({ ok: true, data: { twoFactorRequired: true } });
  });

  it("asks for other sessions to end when the password changes", async () => {
    const fetch = answering(200, { token: "t" });
    await createAuthClient(fetch).changePassword({ currentPassword: "old-password", newPassword: "new-password-1" });
    expect(sentBody(fetch)).toEqual({
      currentPassword: "old-password",
      newPassword: "new-password-1",
      revokeOtherSessions: true,
    });
  });

  it("reads the two-factor setup link and backup codes", async () => {
    const fetch = answering(200, { totpURI: "otpauth://totp/x?secret=ABC", backupCodes: ["a1", "b2", 3] });
    const result = await createAuthClient(fetch).startTwoFactorSetup({ password: "p" });
    expect(result).toEqual({ ok: true, data: { totpUri: "otpauth://totp/x?secret=ABC", backupCodes: ["a1", "b2"] } });
  });

  it("returns the error code and the wait a rate limit asks for", async () => {
    const refused = await createAuthClient(answering(401, { code: "INVALID_EMAIL_OR_PASSWORD" })).signInWithEmail({
      email: "a@b.in",
      password: "wrong",
    });
    expect(refused).toEqual({ ok: false, status: 401, code: "INVALID_EMAIL_OR_PASSWORD", retryAfterSeconds: null });
    const limited = await createAuthClient(answering(429, {}, { "x-retry-after": "42" })).signInWithEmail({
      email: "a@b.in",
      password: "p",
    });
    expect(limited).toEqual({ ok: false, status: 429, code: "TOO_MANY_REQUESTS", retryAfterSeconds: 42 });
  });

  it("sends the sign-out so it outlives the page, which leaves without waiting for it", async () => {
    const fetch = answering(200, { success: true });
    await createAuthClient(fetch).signOut();
    expect(fetch.mock.calls[0]?.[1]?.keepalive).toBe(true);
  });

  it("gives up on signing out after 5 seconds, as if the api couldn't be reached", async () => {
    vi.useFakeTimers();
    const stalled = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const signingOut = createAuthClient(stalled).signOut();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(stalled.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await signingOut).toEqual({ ok: false, status: 0, code: "NETWORK", retryAfterSeconds: null });
    vi.useRealTimers();
  });

  it("reports an unreachable api as a network failure", async () => {
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await createAuthClient(offline).signOut()).toEqual({
      ok: false,
      status: 0,
      code: "NETWORK",
      retryAfterSeconds: null,
    });
  });
});
