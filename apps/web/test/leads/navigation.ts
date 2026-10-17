// A stand-in for next/navigation in the lead screens' tests: the address lives here, the router's replace and push
// change it, and whatever reads useSearchParams renders again, as under the real router. A test mocks the module with
// `vi.mock("next/navigation", () => import("./navigation"))` and reads or sets the address through `address`.
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

const BASE = "http://localhost";
let current = "/leads";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function go(href: string): void {
  current = href;
  for (const listener of listeners) listener();
}

/** The address the screen sees: set it before rendering, read it after the screen moved. */
export const address = {
  get href(): string {
    return current;
  },
  set: go,
};

const router = { push: vi.fn(go), replace: vi.fn(go), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

/** The router's calls, for a test that checks where a screen went. */
export const routerCalls = router;

export function useRouter() {
  return router;
}

export function useSearchParams(): URLSearchParams {
  return new URL(
    useSyncExternalStore(subscribe, () => current),
    BASE,
  ).searchParams;
}

export function usePathname(): string {
  return new URL(
    useSyncExternalStore(subscribe, () => current),
    BASE,
  ).pathname;
}
