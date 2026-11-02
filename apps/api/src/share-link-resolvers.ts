// What each kind of shared record opens as at /p/<token> (spec 9.3): an issued document redirects to a short-lived download
// of its PDF; a quote opens as its page (quote-page.ts), where the customer pays by UPI and accepts it, and, once the agency
// has confirmed the booking made from it, as the trip page (trip-page.ts), where they say "I've paid", fill their details
// and leave feedback.
import { publicUploadInput, publicConfirmInput } from "@travel-crm/contracts/bookings";
import { roomRequests } from "@travel-crm/contracts/departures";
import type { Database } from "@travel-crm/db";
import {
  isTripDocument,
  isTripFile,
  publicTripOf,
  publicUploadRecord,
  publicUploadTarget,
  saveTravellerFromLink,
  submitFeedbackFromLink,
  submitPaymentClaim,
} from "@travel-crm/domain/bookings";
import { assertPdfCanBeMade, getIssuedDocument } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import { acceptQuoteFromLink, publicQuoteOf, QUOTE_RECORD_TYPE } from "@travel-crm/domain/quotes";
import type { Profiles } from "@travel-crm/domain/profile";
import { DomainError, isUuid, parseRupees, publicActor } from "@travel-crm/domain/kernel";
import { quotePage } from "./quote-page.js";
import type { ShareLinkAction, ShareLinkDownloads, ShareLinkResolver } from "./share-link-route.js";
import { tripPage } from "./trip-page.js";

export interface ShareLinkResolverDependencies {
  db: Pick<Database, "forOrg">;
  files: Pick<Files, "systemDownloadLink" | "requestUpload" | "confirmUpload">;
  identity: Pick<Identity, "organizationProfile" | "membersHolding">;
  profiles: Pick<Profiles, "get">;
  /** The bucket's origin, which the trip page's script may send pictures to; null when it can't be told. */
  storageOrigin: string | null;
}

const agencyNameOf = async (identity: ShareLinkResolverDependencies["identity"], organizationId: string) =>
  (await identity.organizationProfile(organizationId))?.name ?? "Your travel agency";

/** A PDF of an issued document as a redirect to a short-lived download, once the worker has rendered it. */
async function pdfRedirect(
  dependencies: Pick<ShareLinkResolverDependencies, "db" | "files">,
  organizationId: string,
  documentId: string,
): Promise<Response> {
  const document = await dependencies.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId }));
  // A PDF that can never be rendered isn't coming: say so, rather than asking the customer to retry for ever.
  assertPdfCanBeMade(document);
  // The worker renders the PDF moments after issuing; a customer this quick is asked to try again shortly.
  if (document.pdfAttachmentId === null) {
    throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
  }
  const link = await dependencies.files.systemDownloadLink(organizationId, { attachmentId: document.pdfAttachmentId });
  return Response.redirect(link.url, 302);
}

export function shareLinkResolvers(dependencies: ShareLinkResolverDependencies): Record<string, ShareLinkResolver> {
  const { db, identity, profiles } = dependencies;
  return {
    [QUOTE_RECORD_TYPE]: async (opened, view) => {
      const now = new Date();
      const { quote, trip } = await db.forOrg(opened.organizationId, async (tx) => ({
        quote: await publicQuoteOf(tx, opened.recordId),
        trip: await publicTripOf(tx, opened.recordId, now),
      }));
      const agencyName = await agencyNameOf(identity, opened.organizationId);
      // The trip once the agency has confirmed (or it is over or cancelled); the quote until then.
      if (trip !== null && trip.status !== "requested") {
        const profile = await profiles.get(opened.organizationId);
        return tripPage(trip, {
          agencyName,
          contact: { name: profile?.contactName ?? null, phone: profile?.contactPhone ?? null },
          view,
          storageOrigin: dependencies.storageOrigin,
        });
      }
      return quotePage(quote, agencyName, view, { trip, storageOrigin: dependencies.storageOrigin });
    },
    issued_document: async (opened) => pdfRedirect(dependencies, opened.organizationId, opened.recordId),
  };
}

/** The rupees a form's amount field holds, in paise; a bad one is a refusal the page words. */
function paiseOf(text: string | undefined): number {
  try {
    return parseRupees(text ?? "").amountPaise;
  } catch {
    throw new DomainError("VALIDATION", "AMOUNT_INVALID", "Type the amount you paid");
  }
}

const orNull = (value: string | undefined) => (value === undefined || value === "" ? null : value);
const idOrNull = (value: string | undefined) => (value !== undefined && isUuid(value) ? value : null);
const idsOf = (value: string | undefined) => (value ?? "").split(",").filter((id) => isUuid(id));

/** What a customer may do on a shared record's page: accept a quote naming themselves, and, on a booking, claim a payment, fill a traveller's details and give feedback. */
export function shareLinkActions({
  db,
  identity,
}: Pick<ShareLinkResolverDependencies, "db" | "identity">): Record<string, ShareLinkAction> {
  return {
    [QUOTE_RECORD_TYPE]: async (opened, form) => {
      const now = new Date();
      const { organizationId, recordId: quoteId } = opened;
      switch (form.form) {
        case "claim": {
          await db.forOrg(organizationId, (tx) =>
            submitPaymentClaim(
              tx,
              {
                organizationId,
                quoteId,
                claim: {
                  installmentId: idOrNull(form.installment),
                  amountPaise: paiseOf(form.amount),
                  reference: (form.reference ?? "").trim(),
                  screenshotAttachmentId: idOrNull(form.screenshot),
                },
              },
              now,
            ),
          );
          return "claimed";
        }
        case "traveller": {
          const hasId = (form.idNumber ?? "").trim() !== "";
          await db.forOrg(organizationId, (tx) =>
            saveTravellerFromLink(
              tx,
              {
                organizationId,
                quoteId,
                traveller: {
                  travellerId: form.traveller ?? "",
                  name: (form.name ?? "").trim(),
                  dateOfBirth: orNull(form.dateOfBirth),
                  gender:
                    form.gender === "female" || form.gender === "male" || form.gender === "other" ? form.gender : null,
                  phone: (form.phone ?? "").trim(),
                  emergencyName: (form.emergencyName ?? "").trim(),
                  emergencyPhone: (form.emergencyPhone ?? "").trim(),
                  medicalNotes: (form.medicalNotes ?? "").trim(),
                  ...(form.roomRequest === undefined
                    ? {}
                    : {
                        roomRequest: roomRequests.find((request) => request === form.roomRequest) ?? "none",
                        roomNote: (form.roomNote ?? "").trim(),
                      }),
                  identity: hasId
                    ? {
                        kind: "passport",
                        number: (form.idNumber ?? "").trim(),
                        issuedOn: orNull(form.idIssuedOn),
                        expiresOn: orNull(form.idExpiresOn),
                        nationality: (form.idNationality ?? "").trim(),
                      }
                    : null,
                  idPhotoAttachmentId: idOrNull(form.idPhoto),
                },
              },
              now,
            ),
          );
          return "saved";
        }
        case "feedback": {
          const stars = (value: string | undefined) => (value === undefined || value === "" ? null : Number(value));
          const managers = await identity.membersHolding(organizationId, "bookings:edit");
          await db.forOrg(organizationId, (tx) =>
            submitFeedbackFromLink(tx, {
              organizationId,
              quoteId,
              managers,
              feedback: {
                overall: Number(form.overall ?? 0),
                hotel: stars(form.hotel),
                transport: stars(form.transport),
                guide: stars(form.guide),
                comment: (form.comment ?? "").trim(),
                mayShare: form.mayShare === "yes",
                photoAttachmentIds: idsOf(form.photos),
              },
            }),
          );
          return "feedback";
        }
        default: {
          if (form.agree !== "yes") return;
          await db.forOrg(organizationId, (tx) =>
            acceptQuoteFromLink(
              tx,
              {
                organizationId,
                quoteId,
                name: form.name ?? "",
                // Only an id is looked up: anything else the form sends means the opened quote.
                optionId: form.option !== undefined && isUuid(form.option) ? form.option : undefined,
                tripUpdates: form.tripUpdates === "yes",
              },
              now,
            ),
          );
          return "accepted";
        }
      }
    },
  };
}

/** The documents, files and picture uploads a booking's page serves, each checked to belong to the booking the link opens. */
export function shareLinkDownloads(
  dependencies: Pick<ShareLinkResolverDependencies, "db" | "files">,
): Record<string, ShareLinkDownloads> {
  const { db, files } = dependencies;
  const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  return {
    [QUOTE_RECORD_TYPE]: {
      document: async (opened, documentId) => {
        if (!isUuid(documentId)) throw notFound();
        const mine = await db.forOrg(opened.organizationId, (tx) => isTripDocument(tx, opened.recordId, documentId));
        if (!mine) throw notFound();
        return pdfRedirect(dependencies, opened.organizationId, documentId);
      },
      file: async (opened, attachmentId) => {
        if (!isUuid(attachmentId)) throw notFound();
        const mine = await db.forOrg(opened.organizationId, (tx) => isTripFile(tx, opened.recordId, attachmentId));
        if (!mine) throw notFound();
        const link = await files.systemDownloadLink(opened.organizationId, { attachmentId });
        return Response.redirect(link.url, 302);
      },
      requestUpload: async (opened, body) => {
        const input = publicUploadInput.safeParse(body);
        if (!input.success) throw new DomainError("VALIDATION", "INVALID_UPLOAD", "That picture can't be sent");
        const target = await db.forOrg(opened.organizationId, (tx) =>
          publicUploadTarget(tx, opened.recordId, input.data),
        );
        const { attachment, upload } = await files.requestUpload(publicActor(opened.organizationId), {
          recordType: target.recordType,
          recordId: target.recordId,
          fileName: input.data.fileName,
          contentType: input.data.contentType,
          sizeBytes: input.data.sizeBytes,
          sensitive: target.sensitive,
        });
        return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
      },
      confirmUpload: async (opened, body) => {
        const input = publicConfirmInput.safeParse(body);
        if (!input.success) throw notFound();
        const record = await db.forOrg(opened.organizationId, (tx) =>
          publicUploadRecord(tx, opened.recordId, input.data.attachmentId),
        );
        await files.confirmUpload(publicActor(opened.organizationId), {
          ...record,
          attachmentId: input.data.attachmentId,
        });
        return {};
      },
    },
  };
}
