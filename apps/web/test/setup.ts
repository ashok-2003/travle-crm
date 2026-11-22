// Runs before every test file: DOM matchers such as toBeVisible, and an empty document after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// findBy and waitFor wait 1 s by default; a screen can take longer than that to appear on GitHub's shared runners.
if (process.env.CI !== undefined) configure({ asyncUtilTimeout: 5_000 });

// jsdom lays nothing out, so it has no scrollIntoView; a tab calls it when chosen (components/ui/tabs.tsx). Tests that
// check it replace it with a spy. Files that run without a page (node) have no Element.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}

afterEach(() => {
  cleanup();
});
