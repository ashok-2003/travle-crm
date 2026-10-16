// Renders a lead screen as a signed-in member sees it, over the stubbed api (test/support/api-stub.ts): the app's data
// layer and words, a paid subscription, toasts, a phone-sized or wide screen, and the few browser methods Radix's
// selects, popovers and dialogs call. inputsTo reads back what the screen sent to a procedure.
import type { ReactNode } from "react";
import { vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { SignedInMember } from "@/session/me-context";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";

/** An Owner, who sees every lead and may assign them. */
export const owner = member({ isOwner: true, name: "Asha Sharma" });

/** A salesperson (starter role Sales): their own leads, adding and editing them. */
export const salesperson = member({
  name: "Ravi Kumar",
  userId: "0199a000-0000-7000-8000-0000000000a2",
  permissions: ["leads:view", "leads:create", "leads:edit"],
});

export function renderScreen(
  ui: ReactNode,
  { me = owner, width = "phone" }: { me?: SignedInMember; width?: "phone" | "wide" } = {},
) {
  screenIs(width);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  const queryClient = newQueryClient();
  const rendered = renderWithApi(
    <>
      {ui}
      <Toaster />
    </>,
    queryClient,
    me,
  );
  return { ...rendered, queryClient };
}

/** The inputs each call to an api procedure carried, in call order: a query's from its URL, a mutation's body. */
export function inputsTo(path: string): unknown[] {
  const fetch = vi.mocked(globalThis.fetch);
  return fetch.mock.calls.flatMap(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const prefix = "/api/trpc/";
    if (!url.pathname.startsWith(prefix)) return [];
    const paths = decodeURIComponent(url.pathname.slice(prefix.length)).split(",");
    const body = typeof init?.body === "string" ? init.body : (url.searchParams.get("input") ?? "{}");
    const batch = JSON.parse(body) as Record<string, unknown>;
    return paths.flatMap((called, index) => (called === path ? [batch[String(index)]] : []));
  });
}

/** The last input a procedure was called with. */
export function lastInputTo(path: string): unknown {
  return inputsTo(path).at(-1);
}
