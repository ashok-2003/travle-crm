// The kinds of notification the modules send, for choosing what reaches you, and what a person's choices mean for
// one: a kind's own choice wins over the one for every kind ("*"), as delivery reads them. A module that starts
// sending a kind adds its line here and its words to notifications.json (test/notifications/kinds.test.ts checks).
import type { NotificationChannel, NotificationPreference } from "@travel-crm/contracts/notifications";

/** The choice that covers every kind. */
export const EVERY_KIND = "*";

/** Each kind, and the key of its words under notifications.preferences.kinds. */
export const notificationKinds = [
  { kind: "share-link.opened", messageKey: "shareLinkOpened" },
  { kind: "lead.assigned", messageKey: "leadAssigned" },
  { kind: "lead.slow-reply", messageKey: "leadSlowReply" },
  { kind: "lead.unassigned", messageKey: "leadUnassigned" },
  { kind: "lead.repeat-enquiry", messageKey: "leadRepeatEnquiry" },
  { kind: "lead.imported", messageKey: "leadImported" },
  { kind: "lead.sheet-added", messageKey: "leadSheetAdded" },
  { kind: "sheet.needs-attention", messageKey: "sheetNeedsAttention" },
  { kind: "lead.meta-added", messageKey: "leadMetaAdded" },
  { kind: "meta.needs-attention", messageKey: "metaNeedsAttention" },
  { kind: "meta.new-form", messageKey: "metaNewForm" },
  { kind: "import.finished", messageKey: "importFinished" },
  { kind: "export.ready", messageKey: "exportReady" },
  { kind: "form.busy", messageKey: "formBusy" },
  { kind: "whatsapp.message", messageKey: "whatsappMessage" },
  { kind: "whatsapp.past-customer", messageKey: "whatsappPastCustomer" },
  { kind: "whatsapp.send-failed", messageKey: "whatsappSendFailed" },
] as const;

/** Whether notifications of this kind reach the person on this channel, given their choices. */
export function reaches(
  preferences: readonly NotificationPreference[],
  channel: NotificationChannel,
  kind: string,
): boolean {
  const choiceFor = (forKind: string) =>
    preferences.find((preference) => preference.channel === channel && preference.kind === forKind);
  return !(choiceFor(kind) ?? choiceFor(EVERY_KIND))?.optedOut;
}
