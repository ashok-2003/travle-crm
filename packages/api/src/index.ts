// Public API of @travel-crm/api: the api's and the platform console's tRPC routers and contexts, for apps/api to serve.
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { createPlatformContext, type PlatformContext } from "./platform/context.js";
export { platformRouter, type PlatformRouter } from "./platform/platform-router.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
