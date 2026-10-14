// Prisma CLI settings. Prisma 7 no longer reads .env by itself, so load the repo-root .env here.
import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// dotenv never overrides variables that are already set, so the test suite's own URL wins.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

// Read from process.env (not Prisma's env()) so `prisma generate` works where no database URL exists, e.g. CI.
const url = process.env.DATABASE_MIGRATOR_URL;

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  datasource: url ? { url } : {},
});
