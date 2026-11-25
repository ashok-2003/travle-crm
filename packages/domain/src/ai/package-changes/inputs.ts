// What the agency gave the AI change assistant, as code numbers it: the message's lines (L1...), a PDF's lines (P1.L1...),
// the answers to the AI's questions (A1...), and up to four photos (P1...), whose lines the AI reads itself. The files are
// the member's own finished AI uploads (the rate reader's), one PDF or up to four photos; payment details are removed first.
import { RATE_SHEET_PHOTOS_MAX, type ProposePackageChangesInput } from "@travel-crm/contracts/ai";
import { AI_INPUT_RECORD_TYPE, aiInputImageTypes } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import type { AiPart } from "@travel-crm/integrations/ai";
import type { Files } from "../../files/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { redactPayment } from "../drafts/payment-details.js";
import { pdfParts } from "../rates/source.js";
import { refuse } from "../refusals.js";
import { notFound } from "./runs.js";

const PDF = "application/pdf";
/** A longer line is cut into numbered parts of this many characters. */
const LINE_CHARACTERS = 400;
/** The most of a PDF's text the AI reads. */
const PDF_CHARACTERS = 12_000;
const imageTypes: readonly string[] = aiInputImageTypes;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export interface StoredInput {
  id: string;
  recordId: string;
  contentType: string;
}

/** A text's lines: payment details removed, blank ones dropped, a long one cut between graphemes. */
export function linesOf(text: string): string[] {
  return redactPayment(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line) => {
      const cuts: string[] = [];
      let cut = "";
      for (const { segment } of graphemes.segment(line)) {
        if (cut.length + segment.length > LINE_CHARACTERS) {
          cuts.push(cut);
          cut = "";
        }
        cut += segment;
      }
      return [...cuts, cut];
    });
}

/** The message's lines as L1, L2... */
export const messageLines = (text: string): [string, string][] =>
  linesOf(text).map((line, index) => [`L${String(index + 1)}`, line]);

/** The answers as A1, A2...: the agency's words alone, which are what a change may cite. */
export const answerLines = (answers: ProposePackageChangesInput["answers"]): [string, string][] =>
  answers.flatMap((answer, index) => {
    const text = linesOf(answer.answer).join(" ");
    return text === "" ? [] : [[`A${String(index + 1)}`, text]];
  });

/** The question each answer replies to, by the answer's ref, when the member's last run asked it: context, never evidence. */
export const askedLines = (
  answers: ProposePackageChangesInput["answers"],
  questions: ReadonlyMap<string, string>,
): [string, string][] =>
  answers.flatMap((answer, index) => {
    const asked = questions.get(answer.questionId);
    const text = asked === undefined ? "" : linesOf(asked).join(" ");
    return text === "" || linesOf(answer.answer).length === 0 ? [] : [[`A${String(index + 1)}`, text]];
  });

/** The member's own finished uploads, in the order named: one PDF, or up to four photos. */
export async function checkedInputs(
  tx: OrgTx,
  access: MemberAccess,
  attachmentIds: readonly string[],
): Promise<StoredInput[]> {
  const ids = [...new Set(attachmentIds)];
  if (ids.length === 0) return [];
  const rows = await tx.attachment.findMany({
    where: { id: { in: ids }, recordType: AI_INPUT_RECORD_TYPE, createdBy: access.userId, status: "ready" },
    select: { id: true, recordId: true, contentType: true },
  });
  if (rows.length !== ids.length) throw notFound();
  const stored = ids.flatMap((id) => rows.filter((row) => row.id === id));
  const photos = stored.filter((one) => imageTypes.includes(one.contentType));
  const onePdf = stored.length === 1 && stored[0]?.contentType === PDF;
  if (!onePdf && !(photos.length === stored.length && photos.length <= RATE_SHEET_PHOTOS_MAX)) {
    throw refuse("PACKAGE_CHANGES_FILES", "Give one PDF or up to four photos", "VALIDATION");
  }
  return stored;
}

export interface LoadedInputs {
  photos: AiPart[];
  pdfLines: [string, string][];
}

/** The photos as pictures for the model, or the PDF's lines as P1.L1... (as much as one read takes). */
export async function loadInputs(
  files: Files,
  organizationId: string,
  stored: readonly StoredInput[],
): Promise<LoadedInputs> {
  const bytes = await Promise.all(
    stored.map((one) =>
      files.systemFile(organizationId, {
        recordType: AI_INPUT_RECORD_TYPE,
        recordId: one.recordId,
        attachmentId: one.id,
      }),
    ),
  );
  if (stored[0]?.contentType !== PDF) {
    return {
      photos: stored.map((one, index) => ({
        type: "image",
        mimeType: one.contentType as "image/jpeg" | "image/png" | "image/webp",
        bytes: bytes[index]?.body ?? new Uint8Array(),
      })),
      pdfLines: [],
    };
  }
  let parts;
  try {
    parts = await pdfParts(bytes[0]?.body ?? new Uint8Array());
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    // Scanned, unreadable or too long: the same words pasted, or photos of its pages, can be read.
    throw refuse(
      "PACKAGE_CHANGES_PDF",
      "This PDF can't be read: paste its words or attach photos of its pages",
      "VALIDATION",
    );
  }
  const lines: [string, string][] = [];
  let size = 0;
  for (const text of parts.flatMap((part) => part.lines.map((line) => line.text))) {
    for (const line of linesOf(text)) {
      if (size + line.length > PDF_CHARACTERS) return { photos: [], pdfLines: lines };
      size += line.length;
      lines.push([`P1.L${String(lines.length + 1)}`, line]);
    }
  }
  return { photos: [], pdfLines: lines };
}
