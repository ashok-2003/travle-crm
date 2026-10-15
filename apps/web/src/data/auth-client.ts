// Better Auth's endpoints the screens use, and our organization-code sign-in, as small typed calls. All are JSON
// POSTs to /api/auth on the app's own address, so the browser sends the session cookie and a trusted Origin.
// Only what the screens need is read from each answer: Better Auth's user objects are never kept, because for staff
// without email they hold the placeholder address, which is never shown (ADR 0006). me.get says who is signed in.
import { settledBeforeSigningIn } from "./owed-sign-out";

export type AuthResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** The HTTP status, or 0 when the api couldn't be reached. */
      status: number;
      /** Better Auth's or our error code, e.g. "INVALID_EMAIL_OR_PASSWORD"; "NETWORK" when unreachable. */
      code: string;
      /** From a 429: how long to wait before trying again. */
      retryAfterSeconds: number | null;
    };

export interface SignInOutcome {
  /** The password was right and the person uses two-factor: a code must follow. */
  twoFactorRequired: boolean;
}

export interface TwoFactorSetup {
  /** The otpauth:// link an authenticator app reads, shown as a QR code and as text. */
  totpUri: string;
  /** One-time codes for when the phone is lost. */
  backupCodes: string[];
}

type Fetch = typeof fetch;

/** The JSON body of a response, or {} when it has none or isn't JSON. */
async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** How long signing out waits for the api: the device is already wiped, and a sign-out not heard is owed instead. */
export const SIGN_OUT_TIMEOUT = 5_000;

const sessionEndedListeners = new Set<() => void>();

/**
 * Calls listener whenever a call finds the session gone (changing the password, turning two-factor on or off), so the
 * page leaves as it does on a tRPC 401 (page-data.ts). Returns the unsubscribe function.
 */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

export function createAuthClient(fetchImplementation: Fetch = (...arguments_) => fetch(...arguments_)) {
  async function post<T>(
    path: string,
    body: unknown,
    read: (body: Record<string, unknown>) => T,
    { timeout, keepalive = false }: { timeout?: number; keepalive?: boolean } = {},
  ) {
    // A timer rather than AbortSignal.timeout, so tests can move the clock.
    const giveUp = new AbortController();
    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            giveUp.abort();
          }, timeout);
    let response: Response;
    let json: Record<string, unknown>;
    try {
      response = await fetchImplementation(`/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
        signal: giveUp.signal,
        keepalive,
      });
      json = await bodyOf(response);
    } catch {
      return { ok: false, status: 0, code: "NETWORK", retryAfterSeconds: null } satisfies AuthResult<T>;
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return { ok: true, data: read(json) } satisfies AuthResult<T>;
    const retryAfter = Number(response.headers.get("x-retry-after") ?? response.headers.get("retry-after"));
    const code = typeof json.code === "string" ? json.code : response.status === 429 ? "TOO_MANY_REQUESTS" : "UNKNOWN";
    // Better Auth's session check answers a bare UNAUTHORIZED; its other 401s name what was wrong (INVALID_CODE...).
    if (response.status === 401 && (code === "UNAUTHORIZED" || code === "UNKNOWN")) {
      for (const listener of sessionEndedListeners) listener();
    }
    return {
      ok: false,
      status: response.status,
      code,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    } satisfies AuthResult<T>;
  }

  const signInOutcome = (body: Record<string, unknown>): SignInOutcome => ({
    twoFactorRequired: body.twoFactorRedirect === true,
  });
  const nothing = (): null => null;

  return {
    // A sign-in first waits for a sign-out still being settled on this page (owed-sign-out.ts): that answer deletes
    // the session cookie, and must not land after the new one.
    signInWithEmail: async (input: { email: string; password: string }) => {
      await settledBeforeSigningIn();
      return post("/sign-in/email", input, signInOutcome);
    },
    signInWithCode: async (input: { orgCode: string; username: string; password: string }) => {
      await settledBeforeSigningIn();
      return post("/sign-in/org", input, signInOutcome);
    },
    /** The second step of a two-factor sign-in. trustDevice skips it on this device for 30 days. */
    verifyTwoFactorCode: (input: { code: string; trustDevice: boolean }) =>
      post("/two-factor/verify-totp", input, nothing),
    verifyBackupCode: (input: { code: string; trustDevice: boolean }) =>
      post("/two-factor/verify-backup-code", input, nothing),
    /** Every other session ends, so a stolen temporary password stops working everywhere. */
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      post("/change-password", { ...input, revokeOtherSessions: true }, nothing),
    /** The first half of two-factor setup: the link to scan. confirmTwoFactor's code turns it on. */
    startTwoFactorSetup: (input: { password: string }) =>
      post("/two-factor/enable", input, (body): TwoFactorSetup => ({
        totpUri: typeof body.totpURI === "string" ? body.totpURI : "",
        backupCodes: Array.isArray(body.backupCodes) ? body.backupCodes.filter((code) => typeof code === "string") : [],
      })),
    confirmTwoFactor: (input: { code: string }) => post("/two-factor/verify-totp", input, nothing),
    turnOffTwoFactor: (input: { password: string }) => post("/two-factor/disable", input, nothing),
    /** Answers the same whether or not anyone has the address, so it can't tell who has an account. */
    requestPasswordReset: (input: { email: string; redirectTo: string }) =>
      post("/request-password-reset", input, nothing),
    resetPassword: (input: { token: string; newPassword: string }) => post("/reset-password", input, nothing),
    /**
     * Kept alive, so the request still reaches the api when the page that sent it has already gone (signing out
     * leaves at once). Gives up after SIGN_OUT_TIMEOUT, answering as if the api couldn't be reached.
     */
    signOut: () => post("/sign-out", {}, nothing, { timeout: SIGN_OUT_TIMEOUT, keepalive: true }),
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;

export const authClient = createAuthClient();
