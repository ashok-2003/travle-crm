// Public API of the platform module: the platform console's work across organizations (spec 5 and 7). Only this
// module uses @travel-crm/db/platform, which sees every organization.
export { listPlatformLog, recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
