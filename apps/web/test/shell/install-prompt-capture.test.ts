// The early listener: Chrome fires beforeinstallprompt before the page's scripts have run, so an inline script in the
// root layout keeps the event on `window` for the bar to find. And where the bar is mounted: the signed-in agency app
// alone, never the console or the public pages.
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { InstallPromptCapture, installPromptScript } from "@/pwa/install-prompt-capture";

const source = (file: string) => readFileSync(path.join(import.meta.dirname, "../../src", file), "utf8");

/** Runs the script as a page would, with this document's window. */
function runScript(): void {
  runInNewContext(installPromptScript, { window, Event: window.Event });
}

afterEach(() => {
  Reflect.deleteProperty(window, "deferredInstallPrompt");
});

describe("the install prompt's early listener", () => {
  it("keeps the event, stops Chrome's own mini-bar, and says it is saved", () => {
    runScript();
    let saved = 0;
    window.addEventListener("install-prompt-saved", () => (saved += 1));
    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect((window as unknown as { deferredInstallPrompt: unknown }).deferredInstallPrompt).toBe(event);
    expect(saved).toBe(1);
  });

  it("is written into the page as it is, unescaped, so it runs", () => {
    expect(renderToStaticMarkup(InstallPromptCapture())).toBe(`<script>${installPromptScript}</script>`);
  });

  it("forgets the event once the app is installed", () => {
    runScript();
    window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    window.dispatchEvent(new Event("appinstalled"));
    expect((window as unknown as { deferredInstallPrompt: unknown }).deferredInstallPrompt).toBeNull();
  });
});

describe("where the bar is mounted", () => {
  it("is in the signed-in app's layout, and in no console or public page's", () => {
    expect(source("app/(app)/layout.tsx")).toContain("InstallBanner");
    for (const file of ["app/console/layout.tsx", "app/layout.tsx"]) {
      expect(source(file)).not.toContain("InstallBanner");
    }
    expect(source("app/layout.tsx")).toContain("InstallPromptCapture");
  });
});
