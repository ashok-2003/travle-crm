// New package from a PDF: the brochure is read alone, each trip in it is drafted and saved at once as a group package
// (switched off for the AI), its PDF copied on as the brochure, and what the AI still needs to sell it is listed. Each
// find and each draft is one of the month's AI calls; a trip that can't be made is skipped with its reason, and once the
// month's calls or the model run out the rest are skipped with that reason.
import type { FoundTrip, ImportedPdf, PdfDocumentStates } from "@travel-crm/contracts/ai";
import type { SellGap } from "@travel-crm/contracts/quotes";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { generatePackageDepartures } from "../../departures/index.js";
import type { Files } from "../../files/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError, type CalendarDate } from "../../kernel/index.js";
import { attachDraftBrochure, createGroupPackage, packageSellGaps } from "../../quotes/index.js";
import { refuse } from "../refusals.js";
import { draftPackage } from "./draft-package.js";
import { packageInputOf } from "./draft-to-package.js";
import { findTrips } from "./find-trips.js";

/** Refusals after which no further AI call can work this time: the rest of the trips are skipped with the same reason. */
const STOPPING = new Set(["AI_MONTH_LIMIT", "AI_BUSY", "AI_UNAVAILABLE", "AI_NOT_READY", "AI_OFF"]);
const NAME_MAX = 80;

const reasonOf = (error: unknown): string => (error instanceof DomainError ? error.reason : "FAILED");

/** The trips of every part of the document: a long PDF is read part by part, one call each. */
async function tripsOf(
  deps: { db: Database; model: AiModel },
  access: MemberAccess,
  knowledgeId: string,
  now: Date,
): Promise<{ fillId: string; trip: FoundTrip }[]> {
  const scope = { knowledgeId };
  const first = await findTrips(deps, access, {}, now, scope);
  const reads = first.fillId === null ? [] : [first];
  for (const part of first.fillId === null ? first.parts : []) {
    try {
      reads.push(await findTrips(deps, access, { part: part.ref }, now, scope));
    } catch (error) {
      // A part with no trip in it is no failure; anything else (the month's calls, the model) stops the read.
      if (reasonOf(error) !== "PACKAGE_DRAFT_NOTHING") throw error;
    }
  }
  return reads.flatMap(({ fillId, trips }) => (fillId === null ? [] : trips.map((trip) => ({ fillId, trip }))));
}

/** The name, or the first of "name (2)", "name (3)"… no live package has, within the 80 characters a name may take. */
async function freeName(tx: OrgTx, wanted: string): Promise<string> {
  const base = wanted.trim().slice(0, NAME_MAX - 5);
  const taken = new Set(
    (await tx.quoteTemplate.findMany({ where: { name: { startsWith: base } }, select: { name: true } })).map(
      (row) => row.name,
    ),
  );
  if (!taken.has(base)) return base;
  for (let number = 2; ; number += 1) {
    const name = `${base} (${String(number)})`;
    if (!taken.has(name)) return name;
  }
}

/** Whether the document can be read now: its words read and kept. */
async function checkDocument(tx: OrgTx, knowledgeId: string): Promise<void> {
  const row = await tx.aiKnowledge.findUnique({ where: { id: knowledgeId }, select: { status: true, kind: true } });
  if (row?.kind !== "file") throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (row.status === "reading")
    throw refuse("PDF_STILL_READING", "The PDF is still being read. Try again in a moment.");
  if (row.status !== "ready") throw refuse("PDF_UNREADABLE", "The PDF has no words to read", "VALIDATION");
}

export async function importPackagesFromPdf(
  deps: { db: Database; model: AiModel; files: Files },
  access: MemberAccess,
  knowledgeId: string,
  options: { now: Date; today: CalendarDate; makeDepartures: boolean },
): Promise<ImportedPdf> {
  const { db, model, files } = deps;
  const { organizationId } = access;
  await db.forOrg(organizationId, (tx) => checkDocument(tx, knowledgeId));
  const found = await tripsOf({ db, model }, access, knowledgeId, options.now);
  const result: ImportedPdf = { trips: found.length, packages: [], skipped: [] };
  let stopped: string | null = null;
  for (const { fillId, trip } of found) {
    if (stopped !== null) {
      result.skipped.push({ name: trip.name, reason: stopped });
      continue;
    }
    try {
      const draft = await draftPackage(
        { db, model },
        access,
        { fillId, trip: { ref: trip.ref, name: trip.name, tokens: trip.evidence.map((line) => line.token) } },
        options.now,
      );
      const save = (withSeasons: boolean) =>
        db.forOrg(organizationId, async (tx) => {
          const name = await freeName(tx, draft.name.value ?? trip.name);
          const input = packageInputOf(draft, name, knowledgeId, trip.placeWords);
          if (input === null) return null;
          const { id } = await createGroupPackage(tx, access, withSeasons ? input : { ...input, seasons: [] });
          if (options.makeDepartures) await generatePackageDepartures(tx, access, id, options.today);
          return { id, name };
        });
      // Seasons the brochure gives that can't be kept as they are (two that overlap) leave the package without them:
      // the prices are then a gap to fill, never a package lost.
      const made = await save(true).catch((error: unknown) => {
        if (error instanceof DomainError && error.code === "VALIDATION") return save(false);
        throw error;
      });
      if (made === null) {
        result.skipped.push({ name: trip.name, reason: "PACKAGE_DRAFT_UNREADABLE" });
        continue;
      }
      // The brochure's copy opens transactions of its own; if it fails the package stays, without it.
      await attachDraftBrochure({ db, files }, access, made.id, knowledgeId).catch(() => undefined);
      const gaps: SellGap[] = await db.forOrg(organizationId, (tx) =>
        packageSellGaps(tx, organizationId, made.id, options.today),
      );
      result.packages.push({ ...made, gaps });
    } catch (error) {
      const reason = reasonOf(error);
      if (STOPPING.has(reason)) stopped = reason;
      result.skipped.push({ name: trip.name, reason });
    }
  }
  return result;
}

/** Where each uploaded PDF stands, while the worker reads it: a PDF of another agency, or none, is not listed. */
export async function pdfDocumentStatesOf(tx: OrgTx, knowledgeIds: readonly string[]): Promise<PdfDocumentStates> {
  const rows = await tx.aiKnowledge.findMany({
    where: { id: { in: [...knowledgeIds] }, kind: "file" },
    select: { id: true, status: true },
  });
  return rows.map((row) => ({
    knowledgeId: row.id,
    status: row.status === "reading" || row.status === "ready" ? row.status : "failed",
  }));
}
