// The only words the visitor's pages carry (W42, weight): the form's own, the sentences for a refusal and the form checks'
// shared line. The root layout would otherwise put every message of the app into each page's HTML (about 44 KB gzipped).
import { messages } from "@/i18n/messages";

export const formMessages = {
  websiteForm: messages.websiteForm,
  errors: messages.errors,
  forms: messages.forms,
};
