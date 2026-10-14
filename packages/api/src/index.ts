// Public API of @travel-crm/api: the tRPC router and its context, for apps/api to serve.
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
