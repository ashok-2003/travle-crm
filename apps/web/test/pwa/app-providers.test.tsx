// The root providers (W29, ruling F3): the form's pages open no IndexedDB and register no service worker, every other path
// still gets both.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/pwa/app-providers";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("@/data/providers", () => ({
  DataProviders: ({ children }: { children: React.ReactNode }) => <div data-testid="data-providers">{children}</div>,
}));
vi.mock("@/pwa/service-worker-registration", () => ({
  ServiceWorkerRegistration: () => <div data-testid="worker-registration" />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppProviders", () => {
  it("skips the data layer and the worker registration on /f and /embed, and never touches IndexedDB", () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    for (const current of ["/f/abc", "/embed/abc"]) {
      path.current = current;
      const { unmount } = render(
        <AppProviders>
          <p>the form</p>
        </AppProviders>,
      );
      expect(screen.getByText("the form"), current).toBeVisible();
      expect(screen.queryByTestId("data-providers"), current).toBeNull();
      expect(screen.queryByTestId("worker-registration"), current).toBeNull();
      unmount();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("still gives every other path both", () => {
    for (const current of ["/", "/leads", "/fx", "/embedded", "/settings/lead-sources/website-form"]) {
      path.current = current;
      const { unmount } = render(
        <AppProviders>
          <p>a screen</p>
        </AppProviders>,
      );
      expect(screen.getByTestId("data-providers"), current).toBeInTheDocument();
      expect(screen.getByTestId("worker-registration"), current).toBeInTheDocument();
      expect(screen.getByText("a screen")).toBeVisible();
      unmount();
    }
  });
});
