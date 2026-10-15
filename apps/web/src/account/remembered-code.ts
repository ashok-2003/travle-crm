// The organization code the app remembers after a code sign-in (spec 6.3), so staff type only their username and
// password next time. Kept in localStorage: it isn't secret (it's on every invoice). Storage can be blocked or full,
// which just means typing the code again.
import { useSyncExternalStore } from "react";

const KEY = "travel-crm.organization-code";

export function rememberedOrganizationCode(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Pages are rendered ahead of time, where nothing is remembered; the browser then reads the real value. */
export function useRememberedOrganizationCode(): string | null {
  return useSyncExternalStore(subscribe, rememberedOrganizationCode, () => null);
}

/** Another tab signing in with a code updates the remembered one here too. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
  };
}

export function rememberOrganizationCode(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // Not remembered; nothing else changes.
  }
}
