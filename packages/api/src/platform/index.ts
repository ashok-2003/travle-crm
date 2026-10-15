// Public API of @travel-crm/api/platform: the platform console's tRPC router and context, which only the console
// process serves. Apart from @travel-crm/api's own entry, so the api server never loads the platform's code.
export { createPlatformContext, type PlatformContext } from "./context.js";
export { platformRouter, type PlatformRouter } from "./platform-router.js";
