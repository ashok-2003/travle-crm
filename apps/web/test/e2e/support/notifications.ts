// What the notification journeys need beyond every journey's agency: a quotation the Owner issued and shared, made
// through the domain as the documents screen will make it, rendered by the journeys' own worker, so a customer can
// open its link; and a look at the Owner's bell and push subscriptions in the database, in the agency's own scope.
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import { createDatabase, type Database } from "@travel-crm/db";
import { getIssuedDocument, issueDocument } from "@travel-crm/domain/documents";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { createShareLink } from "@travel-crm/domain/share-links";
import { expect, test as base } from "./fixtures";

export { expect };

export interface SharedDocument {
  /** "/p/<token>": anyone may open it, signed in or not. */
  path: string;
  label: string;
}

interface NotificationFixtures {
  owner: MemberAccess;
  /** The Owner shares a quotation once the worker has rendered its PDF. */
  shareAsOwner: () => Promise<SharedDocument>;
  /** How many of the Owner's notifications are unread. */
  ownerUnread: () => Promise<number>;
  /** The endpoints of the Owner's browsers that may receive push. */
  ownerPushEndpoints: () => Promise<string[]>;
}

const quotation = (organizationName: string): IssueDocumentInput => ({
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", amount: "₹1,46,500.00" }],
    totals: [{ label: "Total", amount: "₹1,46,500.00", emphasis: true }],
  },
  branding: { organizationName },
});

/** Waits for the worker to render the document's PDF: until then its link asks the customer to wait. */
async function rendered(organizationData: Database, organizationId: string, documentId: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (await organizationData.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId }))).pdfAttachmentId,
      { timeout: 30_000 },
    )
    .not.toBeNull();
}

export const test = base.extend<NotificationFixtures, { organizationData: Database }>({
  organizationData: [
    async ({}, use) => {
      const url = process.env.E2E_DATABASE_URL;
      if (!url)
        throw new Error("E2E_DATABASE_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
      const organizationData = createDatabase(url, { maxConnections: 2 });
      await use(organizationData);
      await organizationData.disconnect();
    },
    { scope: "worker" },
  ],
  owner: async ({ database, agency }, use) => {
    const user = await database.platform.user.findUniqueOrThrow({ where: { email: agency.owner.email } });
    const access = await database.identity.resolveAccess(user.id, agency.organizationId);
    if (!access) throw new Error("the agency's owner has no access");
    await use(access);
  },
  shareAsOwner: async ({ organizationData, agency, owner }, use) => {
    await use(async () => {
      const document = await organizationData.forOrg(agency.organizationId, (tx) =>
        issueDocument(tx, owner, quotation(agency.name)),
      );
      await rendered(organizationData, agency.organizationId, document.id);
      const label = `Quotation ${document.number}`;
      const link = await organizationData.forOrg(agency.organizationId, (tx) =>
        createShareLink(tx, owner, { recordType: "issued_document", recordId: document.id, label }),
      );
      return { path: link.path, label };
    });
  },
  ownerUnread: async ({ organizationData, agency, owner }, use) => {
    await use(() =>
      organizationData.forOrg(agency.organizationId, (tx) =>
        tx.notification.count({ where: { recipientUserId: owner.userId, readAt: null } }),
      ),
    );
  },
  ownerPushEndpoints: async ({ organizationData, agency, owner }, use) => {
    await use(async () => {
      const subscriptions = await organizationData.forOrg(agency.organizationId, (tx) =>
        tx.pushSubscription.findMany({ where: { userId: owner.userId }, select: { endpoint: true } }),
      );
      return subscriptions.map(({ endpoint }) => endpoint);
    });
  },
});
