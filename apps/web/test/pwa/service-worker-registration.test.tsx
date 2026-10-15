// The worker is registered once the page has finished loading, so its install (which fetches every screen's shell)
// doesn't compete with the first page's own files on a slow connection.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "@/pwa/register-service-worker";
import { ServiceWorkerRegistration } from "@/pwa/service-worker-registration";

vi.mock("@/pwa/register-service-worker", () => ({ registerServiceWorker: vi.fn(() => Promise.resolve(true)) }));

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

afterEach(() => {
  setReadyState("complete");
  vi.mocked(registerServiceWorker).mockClear();
});

describe("ServiceWorkerRegistration", () => {
  it("waits for the page's load event", () => {
    setReadyState("loading");
    render(<ServiceWorkerRegistration />);
    expect(registerServiceWorker).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    expect(registerServiceWorker).toHaveBeenCalledOnce();
  });

  it("registers at once when the page has already loaded", () => {
    setReadyState("complete");
    render(<ServiceWorkerRegistration />);
    expect(registerServiceWorker).toHaveBeenCalledOnce();
  });

  it("doesn't register after leaving before the load event", () => {
    setReadyState("loading");
    render(<ServiceWorkerRegistration />).unmount();
    window.dispatchEvent(new Event("load"));
    expect(registerServiceWorker).not.toHaveBeenCalled();
  });
});
