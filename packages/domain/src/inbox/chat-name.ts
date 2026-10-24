// The name a chat is shown by: the person's name in the CRM, else the customer's WhatsApp profile name, else nothing (the screen
// then shows the number). The stand-in name a nameless number gave its person ("WhatsApp +91 ...") counts as no name.
import { isWhatsAppPlaceholderName } from "../crm/index.js";

export function chatNameOf(chat: {
  phoneE164: string;
  profileName: string | null;
  person: { name: string } | null;
}): string | null {
  const personName = chat.person?.name ?? null;
  if (personName !== null && !isWhatsAppPlaceholderName(personName, chat.phoneE164)) return personName;
  const profile = chat.profileName?.trim() ?? "";
  return profile === "" ? null : profile;
}
