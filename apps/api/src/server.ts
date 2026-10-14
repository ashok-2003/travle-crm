// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { createIdentity } from "@travel-crm/domain/identity";
import { createApp } from "./app.js";
import { authSettingsFrom, loadEnvironment } from "./environment.js";

const environment = loadEnvironment(process.env);
const identity = createIdentity({
  databaseUrl: environment.DATABASE_URL,
  maxConnections: environment.DATABASE_POOL_SIZE,
  auth: authSettingsFrom(environment),
});

const server = serve({ fetch: createApp({ identity }).fetch, port: environment.PORT }, (address) => {
  console.log(`api listening on port ${String(address.port)}`);
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, then close the pool.
function shutDown(): void {
  server.close(() => {
    void identity.disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
