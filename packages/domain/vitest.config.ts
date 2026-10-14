// Unit tests for the domain's business rules.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "domain",
    include: ["test/**/*.test.ts"],
  },
});
