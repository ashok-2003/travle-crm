// Entry point for the platform console only: a client that sees every organization (platform_access policy).
import { createPrismaClient, type DatabaseClient } from "./client.js";

export type PlatformClient = DatabaseClient;

/** Connect as the app_platform role. Never use this for requests made by an organization's staff. */
export function createPlatformClient(url: string): PlatformClient {
  return createPrismaClient(url);
}
