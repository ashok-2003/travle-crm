// Types next-intl checks message keys and the locale against: t("staff.title") fails to compile if the key is missing.
import type { locale, Messages } from "./messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof locale;
    Messages: Messages;
  }
}
