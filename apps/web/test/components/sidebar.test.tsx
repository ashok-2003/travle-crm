// The desktop sidebar folds to its icons only with its button, so it takes no keyboard shortcut: Ctrl/Cmd+B stays the
// browser's (bookmarks, bold), and pressing it leaves the sidebar open.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("leaves Ctrl/Cmd+B to the browser, and stays open", () => {
  const noop = () => undefined;
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: noop, removeEventListener: noop }));
  render(
    <SidebarProvider>
      <Sidebar>Destinations</Sidebar>
    </SidebarProvider>,
  );
  expect(fireEvent.keyDown(window, { key: "b", ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(window, { key: "b", metaKey: true })).toBe(true);
  expect(screen.getByText("Destinations").closest("[data-state]")).toHaveAttribute("data-state", "expanded");
});
