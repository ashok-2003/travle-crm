// A customer's erasure, the platform's side (R38): what erasing a "person" record does beyond the record steps every
// erasure takes, inside the erasure job's platform transaction. crm erases its own rows; the leads' tasks,
// notifications and files go through their modules, and the counts go in the platform log.
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { customerContacts, eraseCustomer, type CustomerSubject } from "../crm/index.js";
import { deleteRecordFiles } from "../files/index.js";
import type { Actor } from "../kernel/index.js";
import { forgetRecordNotifications } from "../notifications/index.js";
import { withdrawWhatsApp } from "../inbox/index.js";
import { withdrawAiParts } from "../ai/index.js";
import { eraseQuoteParts } from "../quotes/index.js";
import { eraseSalesParts } from "../sales/index.js";
import { withdrawMetaLeads } from "../meta-leads/index.js";
import { lockSheetConnections, type SheetsHashes, withdrawSheetRows } from "../sheets/index.js";
import { cancelOpenTasks, redactTaskTitles } from "../tasks/index.js";

/**
 * A customer's part (R38): crm empties and soft-deletes them and their leads, with the leads' notes, repeat enquiries
 * and blocked contacts. Each lead's open tasks are cancelled, since a task on an erased lead would sit in someone's
 * Today for ever, and every one of their titles emptied; the notifications and files about each lead go. Counts only,
 * for the platform log.
 */
export async function eraseCustomerParts(
  tx: PlatformTx,
  actor: Actor,
  subject: CustomerSubject,
  now: Date,
  sheetsHashes: SheetsHashes | null = null,
) {
  const { organizationId } = subject;
  // The sheets' connections first, as a check takes them (SD9).
  await lockSheetConnections(tx, organizationId);
  // Their contacts are read before the erasure empties them, for the sheets' tombstones (S43).
  const contacts = await customerContacts(tx, subject);
  const { leadIds, ...erased } = await eraseCustomer(tx, subject);
  const leads = leadIds.map((recordId) => ({ organizationId, recordType: "lead", recordId }));
  // Their quotes' personal words and their hot-lead signals; the invoices and receipts issued are kept, as tax law asks.
  const quotes = await eraseQuoteParts(tx, { organizationId, leadIds });
  const sales = await eraseSalesParts(tx, { organizationId, leadIds });
  // Module code for one organization runs in a step, as the runtime role: its audit entries and events name it.
  const tasksCancelled = await asOrganization(tx, organizationId, async (orgTx) => {
    let cancelled = 0;
    for (const lead of leads) cancelled += (await cancelOpenTasks(orgTx, actor, lead, now)).length;
    return cancelled;
  });
  const taskTitles = await redactTaskTitles(tx, { organizationId, recordType: "lead", recordIds: leadIds });
  let notifications = 0;
  let files = 0;
  for (const lead of leads) {
    notifications += await forgetRecordNotifications(tx, {
      organizationId,
      recordId: lead.recordId,
      sourceEventIds: [],
    });
    files += await deleteRecordFiles(tx, lead, now);
  }
  const sheets = await withdrawSheetRows(tx, sheetsHashes, {
    organizationId,
    personId: subject.personId,
    contacts,
    now,
  });
  // Meta's ledger keeps the Meta lead ids (so the catch-up never brings the lead back) and nothing of the person.
  const meta = await withdrawMetaLeads(tx, { organizationId, personId: subject.personId });
  // The AI's drafts in their chats (ids and a hash, never the words).
  const ai = await withdrawAiParts(tx, { organizationId, personId: subject.personId });
  // WhatsApp: the chat's words and files are emptied and the chat is erased; MSG91, Meta and the phone keep their own copy.
  const whatsapp = await withdrawWhatsApp(tx, {
    organizationId,
    personId: subject.personId,
    phones: contacts.phones,
    now,
  });
  return {
    leads: leadIds.length,
    ...erased,
    tasksCancelled,
    taskTitles,
    quotesEmptied: quotes.quotes,
    paymentReferencesEmptied: quotes.payments,
    hotLeadSignals: sales.signals,
    aiDrafts: ai.drafts,
    aiInsights: ai.insights,
    notifications,
    files,
    sheetRowsWithdrawn: sheets.rowsWithdrawn,
    metaLeadsWithdrawn: meta.leadsWithdrawn,
    whatsappMessagesWithdrawn: whatsapp.messages,
    whatsappFiles: whatsapp.files,
    whatsappInboxRows: whatsapp.inboxRows,
  };
}
