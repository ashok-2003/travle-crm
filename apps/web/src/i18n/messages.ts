// Every message the app shows, by namespace (spec 9.6: next-intl from day one, English only in Phase 1). Each feature
// owns one namespace file, so features can be written side by side without touching each other's words.
import account from "./messages/en-IN/account.json";
import common from "./messages/en-IN/common.json";
import consoleMessages from "./messages/en-IN/console.json";
import errors from "./messages/en-IN/errors.json";
import pwa from "./messages/en-IN/pwa.json";
import roles from "./messages/en-IN/roles.json";
import settings from "./messages/en-IN/settings.json";
import shell from "./messages/en-IN/shell.json";
import staff from "./messages/en-IN/staff.json";

export const locale = "en-IN";

// "console" would shadow the global console in this module, hence the import's longer name.
export const messages = { account, common, console: consoleMessages, errors, pwa, roles, settings, shell, staff };

export type Messages = typeof messages;
