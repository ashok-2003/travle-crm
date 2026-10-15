// Better Auth's own password hasher, for the accounts the platform makes outside Better Auth: the demo's staff and
// platform staff. Slow on purpose, so callers hash before their transaction, never inside it.
import type { PlatformServices } from "./services.js";

export async function hashPassword(services: Pick<PlatformServices, "identity">, password: string): Promise<string> {
  return (await services.identity.auth.$context).password.hash(password);
}
