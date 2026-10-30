// What the AI keeps about a person: the drafts made in their chats (ids and a hash of the words, never the words), its
// guess of how their leads would go, the bookings it took on them (travellers' names and dates), the autopilot's state and memory of their chats, and the lessons learned from the
// agency's chats (general, with numbers and emails taken out, but drawn from theirs among others, so they go too: the AI
// learns again from the chats that remain), the forms it filled for their leads and the fields it suggested on them, and the
// recordings and screenshots they were filled from. Deleted when the customer is erased, run on the platform's transaction.
import { withDeleted, type OrgTx } from "@travel-crm/db";
import { AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import { deleteRecordFiles } from "../files/index.js";

export async function withdrawAiParts(
  tx: OrgTx,
  input: {
    organizationId: string;
    personId: string;
    /** Their numbers: a chat stored with no person is found by them. */ phones?: readonly string[];
    now: Date;
  },
): Promise<{
  drafts: number;
  insights: number;
  chats: number;
  lessons: number;
  bookings: number;
  fills: number;
  fields: number;
  inputFiles: number;
}> {
  const conversation = {
    OR: [
      { personId: input.personId },
      ...((input.phones?.length ?? 0) > 0 ? [{ phoneE164: { in: [...(input.phones ?? [])] } }] : []),
    ],
  };
  const drafts = await tx.aiDraft.deleteMany({ where: { organizationId: input.organizationId, conversation } });
  const chats = await tx.aiChat.deleteMany({ where: { organizationId: input.organizationId, conversation } });
  const lessons = await tx.aiLearning.deleteMany({ where: { organizationId: input.organizationId } });
  const insights = await tx.leadAiInsight.deleteMany({
    where: { organizationId: input.organizationId, lead: { personId: input.personId } },
  });
  const bookings = await tx.aiBooking.deleteMany({
    where: { organizationId: input.organizationId, lead: { personId: input.personId } },
  });
  const leads = await tx.lead.findMany({
    where: { organizationId: input.organizationId, personId: input.personId },
    select: { id: true },
  });
  const leadIds = leads.map((lead) => lead.id);
  const fields = await tx.leadAiField.deleteMany({
    where: { organizationId: input.organizationId, leadId: { in: leadIds } },
  });
  const fillRows = await tx.aiFill.findMany({
    where: { organizationId: input.organizationId, subjectId: { in: leadIds } },
    select: { id: true, inputAttachmentId: true },
  });
  const attachmentIds = fillRows.flatMap((fill) => (fill.inputAttachmentId === null ? [] : [fill.inputAttachmentId]));
  const inputs = await withDeleted(() =>
    tx.attachment.findMany({
      where: { organizationId: input.organizationId, id: { in: attachmentIds }, recordType: AI_INPUT_RECORD_TYPE },
      select: { recordId: true },
    }),
  );
  let inputFiles = 0;
  for (const recordId of new Set(inputs.map((row) => row.recordId))) {
    inputFiles += await deleteRecordFiles(
      tx,
      { organizationId: input.organizationId, recordType: AI_INPUT_RECORD_TYPE, recordId },
      input.now,
    );
  }
  const fills = await tx.aiFill.deleteMany({
    where: { organizationId: input.organizationId, id: { in: fillRows.map((fill) => fill.id) } },
  });
  return {
    fills: fills.count,
    fields: fields.count,
    inputFiles,
    drafts: drafts.count,
    insights: insights.count,
    chats: chats.count,
    lessons: lessons.count,
    bookings: bookings.count,
  };
}
