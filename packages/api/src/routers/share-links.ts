// shareLinks.*: links to a shared record, opened at /p/<token> (spec 9.3): made, listed and turned off. The
// Foundation's one shared record is an issued document, and every one today is a branding sample, so settings:manage
// covers them; quotes and invoices bring their own permissions.
import {
  createdShareLink,
  createShareLinkInput,
  listShareLinksInput,
  revokeShareLinkInput,
  shareLinkSummary,
} from "@travel-crm/contracts/share-links";
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import type { OrgTx } from "@travel-crm/db";
import { assertPdfCanBeMade, getIssuedDocument } from "@travel-crm/domain/documents";
import { DomainError } from "@travel-crm/domain/kernel";
import { createShareLink, listShareLinks, revokeShareLink } from "@travel-crm/domain/share-links";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** What /p/<token> can open (apps/api/src/share-link-resolvers.ts): an issued document. */
const SHAREABLE_RECORD_TYPE = "issued_document";

/** The record must be one of the organization's own issued documents: another's is "not found". */
async function sharedDocument(
  tx: OrgTx,
  record: { recordType: string; recordId: string },
): Promise<IssuedDocumentSummary> {
  if (record.recordType !== SHAREABLE_RECORD_TYPE) {
    throw new DomainError("VALIDATION", "INVALID_RECORD_TYPE", "Only issued documents can be shared by link");
  }
  return getIssuedDocument(tx, { documentId: record.recordId });
}

export const shareLinksRouter = router({
  /**
   * A new link, whose whole token is in this answer only: the database keeps a hash of its secret. Minting a link
   * customers open is as sensitive as issuing the document, so the session is read from the database. A document whose
   * PDF can never be made isn't shared: the link would only ever show an error.
   */
  create: freshProcedure
    .requires("settings:manage")
    .input(createShareLinkInput)
    .output(createdShareLink)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        assertPdfCanBeMade(await sharedDocument(tx, input));
        const { expiresAt, ...link } = input;
        return createShareLink(tx, ctx.member, {
          ...link,
          ...(expiresAt === undefined ? {} : { expiresAt: expiresAt === null ? null : new Date(expiresAt) }),
        });
      }),
    ),

  /**
   * A record's links, newest first, with how often and when each was last opened. It is how the Owner finds a link to
   * turn off, so like staff.list it is part of revoking: allowed while read-only, and to the Owner while suspended.
   */
  list: orgProcedure
    .requires("settings:manage")
    .meta({ lifecycle: "revoke" })
    .input(listShareLinksInput)
    .output(z.array(shareLinkSummary))
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        await sharedDocument(tx, input);
        return listShareLinks(tx, input);
      }),
    ),

  /**
   * Turns a link off for good. It takes a customer's access away, so like removing staff it works while read-only,
   * and for the Owner while suspended (ADR 0021).
   */
  revoke: orgProcedure
    .requires("settings:manage")
    .meta({ lifecycle: "revoke" })
    .input(revokeShareLinkInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => revokeShareLink(tx, ctx.member, input)),
    ),
});
