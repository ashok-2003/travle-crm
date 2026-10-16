// When a push arrives the service worker tells the app's open pages (push-message.ts), and the bell asks again at
// once rather than at its next minute; any other message from the worker changes nothing.
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRefreshOnPush } from "@/notifications/bell/use-refresh-on-push";
import { PUSH_ARRIVED } from "@/notifications/push/push-message";
import { newQueryClient, withApp } from "../organization/api";

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
});

/** The service worker container, as a target the test can send the worker's messages from. */
function workerContainer(): EventTarget {
  const container = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: container });
  return container;
}

describe("useRefreshOnPush", () => {
  it("refreshes the bell when the service worker says a push arrived", () => {
    const container = workerContainer();
    const queryClient = newQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { unmount } = renderHook(
      () => {
        useRefreshOnPush();
      },
      { wrapper: withApp(queryClient) },
    );

    container.dispatchEvent(new MessageEvent("message", { data: { type: "something-else" } }));
    expect(invalidate).not.toHaveBeenCalled();
    container.dispatchEvent(new MessageEvent("message", { data: PUSH_ARRIVED }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [["notifications"]] });

    unmount();
    container.dispatchEvent(new MessageEvent("message", { data: PUSH_ARRIVED }));
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("does nothing in a browser without service workers", () => {
    expect(() =>
      renderHook(
        () => {
          useRefreshOnPush();
        },
        { wrapper: withApp(newQueryClient()) },
      ),
    ).not.toThrow();
  });
});
