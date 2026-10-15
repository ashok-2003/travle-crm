// Unit tests for the web app's logic and components, in a simulated browser. No api, no database.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    name: "web",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
