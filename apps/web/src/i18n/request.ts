// next-intl's request configuration: one locale and its messages. Without i18n routing there's no locale in the URL;
// a second language adds routing then.
import { getRequestConfig } from "next-intl/server";
import { locale, messages } from "./messages";

export default getRequestConfig(() => Promise.resolve({ locale, messages }));
