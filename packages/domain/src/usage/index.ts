// Public API of @travel-crm/domain/usage: what members do in the product (each page and its seconds, for the platform
// console's analytics) and the welcome each member sees once.
export { trackVisit } from "./visits.js";
export { markOrganizationBegun, markWelcomeSeen, welcomeOf } from "./welcome.js";
