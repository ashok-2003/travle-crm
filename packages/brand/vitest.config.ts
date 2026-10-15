// Brand tests are plain unit tests: no database.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "brand",
    include: ["test/**/*.test.ts"],
  },
});
