// Unit tests for the tRPC layer. The routers are tested end to end through the HTTP app in apps/api.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
  },
});
