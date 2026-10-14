// Entry point for the platform console only: a client that sees every organization (platform_access policy).
import { createPrismaClient } from "./client.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export type PlatformClient = PrismaClient;

/** Connect as the app_platform role. Never use this for requests made by an organization's staff. */
export function createPlatformClient(url: string): PlatformClient {
  return createPrismaClient(url);
}
