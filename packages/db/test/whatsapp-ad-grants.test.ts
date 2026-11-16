// The runtime role may change only the columns the code changes on an ad: its key and first-seen time stay as noted.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";

describe("whatsapp_ad's update grant", () => {
  let platform: PlatformClient;
  beforeAll(() => {
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
  });

  it("covers headline, source_url, package_id and last_seen_at, and nothing else", async () => {
    const rows = await platform.$queryRaw<{ column_name: string; allowed: boolean }[]>`
      SELECT column_name::text,
             has_column_privilege('app_runtime', 'public.whatsapp_ad', column_name::text, 'UPDATE') AS allowed
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'whatsapp_ad'
      ORDER BY column_name`;
    const allowed = rows.filter((row) => row.allowed).map((row) => row.column_name);
    expect(allowed).toEqual(["headline", "last_seen_at", "package_id", "source_url"]);
  });
});
