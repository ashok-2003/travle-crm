// Reading a supplier's rate sheet (release ai3b): the AI reads a PDF, an Excel file or photos of it and proposes seasons and rate
// rows. It proposes, never saves: staff check each price and save through the supplier's own rate writes (suppliers.saveRateBatch,
// audited with this fill). Short transactions around the model, as Suggest reply has: the checks, one monthly call, the model, then
// the fill's row (or the call given back when the AI didn't answer or found nothing). One read is one call and is capped: a bigger
// sheet is divided into parts (a tab or a few pages) that staff choose, each part another call, said before it is made.
import { AI_INPUT_RECORD_TYPE, aiInputImageTypes, aiRateSheetFileTypes } from "@travel-crm/contracts/files";
import { RATE_SHEET_PHOTOS_MAX, type RateSheetProposal, type ReadRateSheetInput } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel, AiPart } from "@travel-crm/integrations/ai";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { Files } from "../../files/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { DomainError, calendarDateIn } from "../../kernel/index.js";
import { supplierRates } from "../../suppliers/index.js";
import { jsonObjectIn } from "../fill/json.js";
import { modelRefusal, refuse } from "../refusals.js";
import { aiEnabled } from "../settings.js";
import { hashOf } from "../suggest.js";
import { MONTHLY_AI_LIMIT, recordTokens, releaseAiCall, reserveAiCall, usedThisMonth } from "../usage.js";
import { rateSheetPrompt } from "./prompt.js";
import { proposedRates, rowHash } from "./rows.js";
import { excelParts, pdfParts, type SheetPart } from "./source.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const imageTypes: readonly string[] = aiInputImageTypes;

interface Stored {
  id: string;
  recordId: string;
  contentType: string;
}

interface Checked {
  timeZone: string;
  today: string;
  stored: Stored[];
}

/** The member's own finished uploads, in the order they were named; one PDF or Excel file, or up to four photos. */
async function check(tx: OrgTx, access: MemberAccess, input: ReadRateSheetInput, now: Date): Promise<Checked> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
  if (supplier === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such supplier");
  const ids = [...new Set(input.attachmentIds)];
  const rows = await tx.attachment.findMany({
    where: { id: { in: ids }, recordType: AI_INPUT_RECORD_TYPE, createdBy: access.userId, status: "ready" },
    select: { id: true, recordId: true, contentType: true },
  });
  if (rows.length !== ids.length) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const stored = ids.flatMap((id) => rows.filter((row) => row.id === id));
  const photos = stored.filter((one) => imageTypes.includes(one.contentType));
  const files = stored.filter((one) => (aiRateSheetFileTypes as readonly string[]).includes(one.contentType));
  const oneFile = files.length === 1 && stored.length === 1;
  if (!oneFile && !(photos.length === stored.length && photos.length <= RATE_SHEET_PHOTOS_MAX)) {
    throw refuse("RATE_SHEET_MIXED", "Give one PDF or Excel file, or up to four photos", "VALIDATION");
  }
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  return { timeZone, today: calendarDateIn(now, timeZone), stored };
}

type Source = { photos: AiPart[] } | { parts: SheetPart[] };

async function sourceOf(
  { files, spreadsheets }: { files: Files; spreadsheets: Spreadsheets },
  organizationId: string,
  stored: readonly Stored[],
): Promise<Source> {
  const bytes = await Promise.all(
    stored.map((one) =>
      files.systemFile(organizationId, {
        recordType: AI_INPUT_RECORD_TYPE,
        recordId: one.recordId,
        attachmentId: one.id,
      }),
    ),
  );
  const first = stored[0];
  const file = bytes[0];
  if (first === undefined || file === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (imageTypes.includes(first.contentType)) {
    return {
      photos: stored.map((one, index) => ({
        type: "image",
        mimeType: one.contentType as "image/jpeg" | "image/png" | "image/webp",
        bytes: bytes[index]?.body ?? new Uint8Array(),
      })),
    };
  }
  return { parts: first.contentType === XLSX ? await excelParts(spreadsheets, file.body) : await pdfParts(file.body) };
}

export async function readRateSheet(
  { db, model, files, spreadsheets }: { db: Database; model: AiModel; files: Files; spreadsheets: Spreadsheets },
  access: MemberAccess,
  input: ReadRateSheetInput,
  now: Date,
): Promise<RateSheetProposal> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const checked = await db.forOrg(organizationId, (tx) => check(tx, access, input, now));
  const sources = checked.stored.map((one) => ({
    recordId: one.recordId,
    attachmentId: one.id,
    contentType: one.contentType,
  }));
  const source = await sourceOf({ files, spreadsheets }, organizationId, checked.stored);
  const labels = "parts" in source ? source.parts.map((part) => part.label) : [];
  const empty = {
    fillId: null,
    seasons: [],
    rates: [],
    questions: [],
    cut: false,
    sources,
    monthlyLimit: MONTHLY_AI_LIMIT,
  };
  let part: SheetPart | null = null;
  let partIndex = 0;
  if ("parts" in source) {
    const chosen = input.part ?? (source.parts.length === 1 ? 0 : null);
    if (chosen === null) {
      // A big sheet: nothing is read yet. The parts are offered, and no call is used.
      const used = await db.forOrg(organizationId, (tx) => usedThisMonth(tx, now, checked.timeZone));
      return { ...empty, parts: labels, part: null, usedThisMonth: used };
    }
    part = source.parts[chosen] ?? null;
    if (part === null) throw refuse("RATE_SHEET_PART", "There is no such part of this sheet", "VALIDATION");
    partIndex = chosen;
  }

  // One monthly call, taken before the model is asked and given back when it doesn't answer.
  const reserved = await db.forOrg(organizationId, (tx) => reserveAiCall(tx, now, checked.timeZone));
  if (!reserved) throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, checked.timeZone));
  let result;
  try {
    result = await model.complete({
      feature: "read_rates",
      messages: rateSheetPrompt(part === null ? { photos: "photos" in source ? source.photos : [] } : { part }),
      json: true,
      maxTokens: 6000,
      // Opaque: the agency's id, never a person's.
      user: organizationId,
    });
  } catch (error) {
    await giveBack();
    throw error;
  }
  if (!result.ok) {
    await giveBack();
    throw modelRefusal(result.reason);
  }
  const answer = jsonObjectIn(result.text);
  const lines = new Map((part?.lines ?? []).map((line) => [line.token, line]));
  const saved = await db.forOrg(organizationId, async (tx) => {
    const catalog = await supplierRates(tx, input.supplierId);
    const proposed = proposedRates(
      answer,
      part === null ? { photos: "photos" in source ? source.photos.length : 0 } : { lines },
      checked.today,
      catalog,
    );
    // Nothing read is not a call.
    if (answer === null || (proposed.rates.length === 0 && proposed.questions.length === 0)) {
      await releaseAiCall(tx, now, checked.timeZone);
      return null;
    }
    await recordTokens(tx, now, checked.timeZone, { input: result.inputTokens, output: result.outputTokens });
    const [firstId, ...restIds] = checked.stored.map((one) => one.id);
    const row = await tx.aiFill.create({
      data: {
        target: "rate_sheet",
        subjectType: "supplier",
        subjectId: input.supplierId,
        requestedBy: access.userId,
        inputKind: part === null ? "image" : "file",
        inputAttachmentId: firstId ?? null,
        inputAttachmentIds: restIds,
        model: result.model,
        proposalHash: hashOf(proposed.rates.map((one) => rowHash(one)).join(",")),
        fields: proposed.rates.map((one) => one.ref),
        fieldHashes: Object.fromEntries(proposed.rates.map((one) => [one.ref, rowHash(one)])),
      },
      select: { id: true },
    });
    return {
      fillId: row.id,
      seasons: proposed.seasons,
      rates: proposed.rates,
      questions: proposed.questions,
      parts: labels,
      part: partIndex,
      cut: proposed.cut,
      sources,
      usedThisMonth: await usedThisMonth(tx, now, checked.timeZone),
      monthlyLimit: MONTHLY_AI_LIMIT,
    };
  });
  if (saved === null) throw refuse("RATE_SHEET_NOTHING", "The AI found no rates on this sheet", "VALIDATION");
  return saved;
}
