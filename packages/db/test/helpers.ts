// Small helpers shared by the database tests.
import { randomUUID } from "node:crypto";
import type { PlatformClient } from "../src/platform.js";

/** Creates an organization with a unique valid code (12 characters) and returns its id. */
export async function createTestOrganization(platform: PlatformClient, name = "Test agency"): Promise<string> {
  const code = `T${randomUUID().replaceAll("-", "").slice(0, 11).toUpperCase()}`;
  const organization = await platform.organization.create({ data: { name, code } });
  return organization.id;
}
