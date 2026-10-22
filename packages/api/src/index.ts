// Public API of @travel-crm/api: the api's tRPC router and context, for apps/api to serve and the web app to type its
// calls with. The platform console's are @travel-crm/api/platform, which only the console process imports.
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
export { logoLinkOf, publicFormOf, PREVIEW_TOKEN, type PublicFormServices } from "./public-form.js";
