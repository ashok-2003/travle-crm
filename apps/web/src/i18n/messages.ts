// Every message the app shows, by namespace (spec 9.6: next-intl from day one, English only in Phase 1). Each feature
// owns one namespace file, so features can be written side by side without touching each other's words.
import account from "./messages/en-IN/account.json";
import audit from "./messages/en-IN/audit.json";
import business from "./messages/en-IN/business.json";
import calendar from "./messages/en-IN/calendar.json";
import common from "./messages/en-IN/common.json";
import consoleOrganizations from "./messages/en-IN/console-organizations.json";
import consolePlatform from "./messages/en-IN/console-platform.json";
import consoleMessages from "./messages/en-IN/console.json";
import documents from "./messages/en-IN/documents.json";
import errors from "./messages/en-IN/errors.json";
import forms from "./messages/en-IN/forms.json";
import notifications from "./messages/en-IN/notifications.json";
import pwa from "./messages/en-IN/pwa.json";
import roles from "./messages/en-IN/roles.json";
import settings from "./messages/en-IN/settings.json";
import shell from "./messages/en-IN/shell.json";
import staff from "./messages/en-IN/staff.json";
import subscription from "./messages/en-IN/subscription.json";

export const locale = "en-IN";

export const messages = {
  account,
  audit,
  business,
  calendar,
  common,
  // "console" would shadow the global console in this module, hence the import's longer name.
  console: consoleMessages,
  consoleOrganizations,
  consolePlatform,
  documents,
  errors,
  forms,
  notifications,
  pwa,
  roles,
  settings,
  shell,
  staff,
  subscription,
};

export type Messages = typeof messages;
