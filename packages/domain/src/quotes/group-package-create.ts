// Saving a package draft (AI proposes, the owner saves) as a group package: the package row, its seasons through the
// season rules, an audit entry, the draft's applied fields on its fill, and, apart from the transaction, the cited PDF as a brochure.
import { AI_KNOWLEDGE_RECORD_TYPE, PACKAGE_BROCHURE_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { CreateGroupPackageInput } from "@travel-crm/contracts/ai";
import { MAX_PACKAGE_BROCHURES } from "@travel-crm/contracts/quotes";
import { isUniqueViolation, type Database, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { findOrAddDestination } from "../catalog/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { savePackageSeason } from "./package-seasons.js";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
const nameTaken = () => new DomainError("CONFLICT", "PACKAGE_NAME_TAKEN", "Another package already has this name");

/**
 * Records that the member kept these fields of the draft. The fill must be this member's package draft; anything else is not found.
 * (Recorded here, not through the ai module: quotes does not call it, and a rate sheet's recording is for a supplier's rows.)
 */
async function recordDraftApplied(tx: OrgTx, access: MemberAccess, fillId: string, fields: readonly string[]) {
  const fill = await tx.aiFill.findFirst({
    where: { id: fillId, requestedBy: access.userId, target: "package_draft" },
    select: { id: true, appliedFields: true },
  });
  if (fill === null) throw notFound();
  await tx.aiFill.update({
    where: { id: fill.id },
    data: {
      appliedAt: new Date(),
      appliedBy: access.userId,
      appliedFields: [...new Set([...fill.appliedFields, ...fields])],
    },
  });
  await recordAudit(tx, access, {
    action: "ai.fill-applied",
    entityType: "ai_fill",
    entityId: fill.id,
    after: { target: "package_draft", count: fields.length },
  });
}

/**
 * The owner's "Save as package": a group package that the AI may not sell yet, with no payment details, no address and
 * unpublished, with a season for each proposed one (overlaps refused, and then nothing is saved). Departures and the
 * brochure follow, made by the caller (the brochure's copy runs outside the transaction: see attachDraftBrochure).
 */
export async function createGroupPackage(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateGroupPackageInput,
): Promise<{ id: string }> {
  const fill = await tx.aiFill.findFirst({
    where: { id: input.fillId, requestedBy: access.userId, target: "package_draft" },
    select: { id: true },
  });
  if (fill === null) throw notFound();
  if ((await tx.quoteTemplate.findFirst({ where: { name: input.name }, select: { id: true } })) !== null) {
    throw nameTaken();
  }
  const destination = await findOrAddDestination(tx, access, input.destinationName);
  let id: string;
  try {
    id = (
      await tx.quoteTemplate.create({
        data: {
          name: input.name,
          title: input.title,
          days: input.days,
          items: [],
          inclusions: input.inclusions,
          exclusions: input.exclusions,
          notes: "",
          taxRateBasisPoints: 500,
          kind: "group",
          destinationId: destination.id,
          nights: input.nights,
          summary: input.summary,
          highlights: input.highlights,
          cancellationNotes: input.cancellationNotes,
          roomTypes: input.roomTypes,
          pricesIncludeGst: input.pricesIncludeGst,
          advancePerPersonPaise: input.advancePerPersonPaise === null ? null : BigInt(input.advancePerPersonPaise),
          pickupPoints: input.pickupPoints,
          startCity: input.startCity,
          weeklyDays: input.weeklyDays,
          departureMonths: input.departureMonths,
          seatsPerDeparture: input.seatsPerDeparture,
          aiSellable: false,
          createdBy: access.userId,
        },
        select: { id: true },
      })
    ).id;
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  for (const season of input.seasons) {
    await savePackageSeason(tx, access, {
      packageId: id,
      label: season.label,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: season.prices,
    });
  }
  await recordAudit(tx, access, {
    action: "package.created-from-draft",
    entityType: "quote_template",
    entityId: id,
    after: {
      name: input.name,
      fillId: input.fillId,
      appliedFields: input.appliedFields,
      seasons: input.seasons.length,
    },
  });
  await recordDraftApplied(tx, access, input.fillId, input.appliedFields);
  return { id };
}

/**
 * Copies the cited knowledge piece's PDF onto the new package as a brochure, inside storage. It runs after the package's
 * transaction (a file copy opens transactions of its own), within the five brochures a package holds.
 */
export async function attachDraftBrochure(
  { db, files }: { db: Pick<Database, "forOrg">; files: Files },
  access: MemberAccess,
  packageId: string,
  knowledgeId: string,
): Promise<void> {
  const source = await db.forOrg(access.organizationId, async (tx) => {
    const piece = await tx.aiKnowledge.findUnique({
      where: { id: knowledgeId },
      select: { id: true, attachmentId: true },
    });
    const found = await tx.quoteTemplate.findUnique({ where: { id: packageId }, select: { id: true } });
    return piece?.attachmentId == null || found === null
      ? null
      : { recordId: piece.id, attachmentId: piece.attachmentId };
  });
  if (source === null) throw notFound();
  const held = await files.list(access, { recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: packageId });
  if (held.length >= MAX_PACKAGE_BROCHURES) {
    throw new DomainError("LIMIT_REACHED", "PACKAGE_BROCHURE_LIMIT", "A package holds five brochures at most");
  }
  await files.copyFile(
    access,
    { recordType: AI_KNOWLEDGE_RECORD_TYPE, ...source },
    { recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: packageId },
  );
}
