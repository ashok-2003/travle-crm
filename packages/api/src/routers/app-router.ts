// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code. The
// platform console's routers are served apart, by the console process (platform/platform-router.ts).
import { router } from "../trpc.js";
import { attachmentsRouter } from "./attachments.js";
import { auditRouter } from "./audit.js";
import { blockedContactsRouter } from "./blocked-contacts.js";
import { destinationsRouter } from "./destinations.js";
import { documentsRouter } from "./documents.js";
import { leadExportsRouter } from "./lead-exports.js";
import { leadImportsRouter } from "./lead-imports.js";
import { leadSheetsRouter } from "./lead-sheets.js";
import { leadsRouter } from "./leads.js";
import { meRouter } from "./me.js";
import { notificationsRouter } from "./notifications.js";
import { organizationRouter } from "./profile.js";
import { rolesRouter } from "./roles.js";
import { settingsRouter } from "./settings.js";
import { shareLinksRouter } from "./share-links.js";
import { staffRouter } from "./staff.js";
import { staffExportsRouter } from "./staff-exports.js";
import { staffImportsRouter } from "./staff-imports.js";
import { subscriptionRouter } from "./subscription.js";
import { tasksRouter } from "./tasks.js";
import { todayRouter } from "./today.js";

export const appRouter = router({
  me: meRouter,
  staff: staffRouter,
  roles: rolesRouter,
  settings: settingsRouter,
  subscription: subscriptionRouter,
  organization: organizationRouter,
  notifications: notificationsRouter,
  attachments: attachmentsRouter,
  documents: documentsRouter,
  shareLinks: shareLinksRouter,
  audit: auditRouter,
  leads: leadsRouter,
  blockedContacts: blockedContactsRouter,
  destinations: destinationsRouter,
  tasks: tasksRouter,
  today: todayRouter,
  leadImports: leadImportsRouter,
  leadSheets: leadSheetsRouter,
  leadExports: leadExportsRouter,
  staffImports: staffImportsRouter,
  staffExports: staffExportsRouter,
});

export type AppRouter = typeof appRouter;
