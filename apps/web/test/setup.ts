// Runs before every test file: DOM matchers such as toBeVisible, and an empty document after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// findBy and waitFor wait 1 s by default; a screen can take longer than that to appear on GitHub's shared runners.
if (process.env.CI !== undefined) configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
