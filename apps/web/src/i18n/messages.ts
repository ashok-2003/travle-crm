// Every message the app shows, by namespace (spec 9.6: next-intl from day one, English only in Phase 1). Each feature
// owns one namespace file, so features can be written side by side without touching each other's words.
import account from "./messages/en-IN/account.json";
import ai from "./messages/en-IN/ai.json";
import audit from "./messages/en-IN/audit.json";
import bookings from "./messages/en-IN/bookings.json";
import business from "./messages/en-IN/business.json";
import calendar from "./messages/en-IN/calendar.json";
import common from "./messages/en-IN/common.json";
import consoleGrowth from "./messages/en-IN/console-growth.json";
import consoleOrganizations from "./messages/en-IN/console-organizations.json";
import consolePlatform from "./messages/en-IN/console-platform.json";
import consoleMessages from "./messages/en-IN/console.json";
import departures from "./messages/en-IN/departures.json";
import dashboard from "./messages/en-IN/dashboard.json";
import documents from "./messages/en-IN/documents.json";
import errors from "./messages/en-IN/errors.json";
import exportsMessages from "./messages/en-IN/exports.json";
import finance from "./messages/en-IN/finance.json";
import forms from "./messages/en-IN/forms.json";
import imports from "./messages/en-IN/imports.json";
import inbox from "./messages/en-IN/inbox.json";
import consoleWhatsapp from "./messages/en-IN/console-whatsapp.json";
import leads from "./messages/en-IN/leads.json";
import metaLeads from "./messages/en-IN/meta-leads.json";
import notifications from "./messages/en-IN/notifications.json";
import home from "./messages/en-IN/home.json";
import pwa from "./messages/en-IN/pwa.json";
import quotes from "./messages/en-IN/quotes.json";
import reports from "./messages/en-IN/reports.json";
import roles from "./messages/en-IN/roles.json";
import sales from "./messages/en-IN/sales.json";
import settings from "./messages/en-IN/settings.json";
import sheets from "./messages/en-IN/sheets.json";
import shell from "./messages/en-IN/shell.json";
import staff from "./messages/en-IN/staff.json";
import subscription from "./messages/en-IN/subscription.json";
import suppliers from "./messages/en-IN/suppliers.json";
import tasks from "./messages/en-IN/tasks.json";
import today from "./messages/en-IN/today.json";
import vip from "./messages/en-IN/vip.json";
import websiteForm from "./messages/en-IN/website-form.json";
import websiteFormSettings from "./messages/en-IN/website-form-settings.json";
import welcome from "./messages/en-IN/welcome.json";

export const locale = "en-IN";

export const messages = {
  account,
  audit,
  bookings,
  business,
  calendar,
  common,
  // "console" would shadow the global console in this module, hence the import's longer name.
  console: consoleMessages,
  consoleGrowth,
  consoleOrganizations,
  consolePlatform,
  dashboard,
  departures,
  documents,
  errors,
  // "exports" is CommonJS's module object, hence this import's longer name too.
  exports: exportsMessages,
  finance,
  forms,
  imports,
  inbox,
  consoleWhatsapp,
  leads,
  metaLeads,
  notifications,
  home,
  pwa,
  quotes,
  ai,
  reports,
  roles,
  sales,
  settings,
  sheets,
  shell,
  staff,
  subscription,
  suppliers,
  tasks,
  today,
  websiteForm,
  websiteFormSettings,
  vip,
  welcome,
};

export type Messages = typeof messages;
