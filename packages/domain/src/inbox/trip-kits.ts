// Trip details (sales inbox): what a sales team sends every enquirer about a trip, set up once by the Owner and Admins
// (inbox:templates) in Settings, WhatsApp: the trip's words (itinerary, inclusions, price, payment details), its files
// (photos, videos, PDFs, voice notes, stored as attachments of the trip), and the keywords that send it by itself. Sending
// is trip-kit-send.ts.
import { TRIP_KIT_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  MAX_TRIP_KIT_FILES,
  MAX_WHATSAPP_SEND_BYTES,
  tripKitList,
  type CreateTripKitInput,
  type RequestTripKitUploadInput,
  type TripKit,
  type TripKitFileInput,
  type UpdateTripKitInput,
} from "@travel-crm/contracts/inbox";
import { isUniqueViolation, softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const nameTaken = () => new DomainError("CONFLICT", "TRIP_KIT_NAME_TAKEN", "Another trip already has this name");
const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** Keywords as they are matched: lower case, trimmed, each once. */
const cleanKeywords = (keywords: readonly string[]) => [
  ...new Set(keywords.map((word) => word.trim().toLowerCase()).filter((word) => word !== "")),
];

export interface TripKitDependencies {
  db: Database;
  files: Files;
}

/** Every trip of the agency with its files, by name. */
export async function listTripKits({ db, files }: TripKitDependencies, access: MemberAccess): Promise<TripKit[]> {
  const kits = await db.forOrg(access.organizationId, (tx) =>
    tx.tripKit.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, message: true, keywords: true, autoSend: true },
    }),
  );
  // One query for every trip's files, not one per trip.
  const attached = await files.listForRecords(
    access,
    TRIP_KIT_RECORD_TYPE,
    kits.map((kit) => kit.id),
  );
  return tripKitList.parse(
    kits.map((kit) => ({
      ...kit,
      files: (attached.get(kit.id) ?? []).map((file) => ({
        id: file.id,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        ready: file.status === "ready",
      })),
    })),
  );
}

export async function createTripKit(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateTripKitInput,
): Promise<{ id: string }> {
  if ((await tx.tripKit.findFirst({ where: { name: input.name }, select: { id: true } })) !== null) throw nameTaken();
  try {
    const row = await tx.tripKit.create({
      data: { ...input, keywords: cleanKeywords(input.keywords), createdBy: access.userId },
      select: { id: true, name: true },
    });
    await recordAudit(tx, access, {
      action: "inbox.trip-kit-created",
      entityType: "trip_kit",
      entityId: row.id,
      after: { name: row.name },
    });
    return { id: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

export async function updateTripKit(tx: OrgTx, access: MemberAccess, input: UpdateTripKitInput): Promise<void> {
  const { tripKitId, ...changes } = input;
  const before = await tx.tripKit.findUnique({ where: { id: tripKitId }, select: { id: true, name: true } });
  if (before === null) throw notFound();
  const clash = await tx.tripKit.findFirst({
    where: { name: changes.name, id: { not: tripKitId } },
    select: { id: true },
  });
  if (clash !== null) throw nameTaken();
  try {
    await tx.tripKit.update({
      where: { id: tripKitId },
      data: { ...changes, keywords: cleanKeywords(changes.keywords) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  await recordAudit(tx, access, {
    action: "inbox.trip-kit-changed",
    entityType: "trip_kit",
    entityId: tripKitId,
    before: { name: before.name },
    after: { name: changes.name },
  });
}

export async function deleteTripKit(tx: OrgTx, access: MemberAccess, tripKitId: string): Promise<void> {
  const kit = await tx.tripKit.findUnique({ where: { id: tripKitId }, select: { id: true, name: true } });
  if (kit === null) throw notFound();
  await tx.tripKit.update({ where: { id: tripKitId }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "inbox.trip-kit-deleted",
    entityType: "trip_kit",
    entityId: tripKitId,
    before: { name: kit.name },
  });
}

/** Step one of adding a file to a trip: within WhatsApp's 16 MB and the trip's ten files, a place to put it. */
export async function requestTripKitUpload(
  { db, files }: TripKitDependencies,
  access: MemberAccess,
  input: RequestTripKitUploadInput,
) {
  const kit = await db.forOrg(access.organizationId, (tx) =>
    tx.tripKit.findUnique({ where: { id: input.tripKitId }, select: { id: true } }),
  );
  if (kit === null) throw notFound();
  if (input.sizeBytes > MAX_WHATSAPP_SEND_BYTES) {
    throw new DomainError("VALIDATION", "ATTACHMENT_TOO_BIG", "The file is over the 16 MB WhatsApp allows here");
  }
  const held = await files.list(access, { recordType: TRIP_KIT_RECORD_TYPE, recordId: kit.id });
  if (held.length >= MAX_TRIP_KIT_FILES) {
    throw new DomainError("LIMIT_REACHED", "TRIP_KIT_FILE_LIMIT", "A trip holds ten files at most");
  }
  const { attachment, upload } = await files.requestUpload(access, {
    recordType: TRIP_KIT_RECORD_TYPE,
    recordId: kit.id,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

/** Step two: the file is in storage, and the trip holds it. */
export async function confirmTripKitUpload(
  { files }: TripKitDependencies,
  access: MemberAccess,
  input: TripKitFileInput,
): Promise<void> {
  await files.confirmUpload(access, {
    recordType: TRIP_KIT_RECORD_TYPE,
    recordId: input.tripKitId,
    attachmentId: input.attachmentId,
  });
}

export async function removeTripKitFile(
  { files }: TripKitDependencies,
  access: MemberAccess,
  input: TripKitFileInput,
): Promise<void> {
  await files.remove(access, {
    recordType: TRIP_KIT_RECORD_TYPE,
    recordId: input.tripKitId,
    attachmentId: input.attachmentId,
  });
}
