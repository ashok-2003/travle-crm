// Public API of @travel-crm/domain/usage: what members do in the product (each page and its seconds, for the platform
// console's analytics) the welcome each member sees once, and the phone types they open the installed app on.
export { installedAppPlatforms, recordInstalledAppVisit } from "./installed-app.js";
export { trackVisit } from "./visits.js";
export { markOrganizationBegun, markWelcomeSeen, welcomeOf } from "./welcome.js";
