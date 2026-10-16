// Renders an organization screen's parts as a signed-in member sees them: with the app's messages, the member, a paid
// subscription, and a phone-sized or wide screen.
import type { ReactNode } from "react";
import { vi } from "vitest";
import type { SignedInMember } from "@/session/me-context";
import { member } from "../support/members";
import { newQueryClient, renderWithApi } from "./api";

/** jsdom has no matchMedia: answer every query as a screen of the given width would. */
export function screenIs(width: "phone" | "wide"): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: width === "wide", addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

export function renderAs(ui: ReactNode, me: SignedInMember = member({ isOwner: true })) {
  return renderWithApi(ui, newQueryClient(), me);
}
