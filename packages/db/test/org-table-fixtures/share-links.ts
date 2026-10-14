// Isolation fixtures for share links and their opens. Both are append-only for the runtime role: links can only be
// revoked (two named columns), opens never change.
import type { OrgTableFixtures } from "../org-table-fixture.js";

const recordId = "0199e7a0-0000-7000-8000-00000000f001";

export const fixtures: OrgTableFixtures = {
  share_link: {
    create: (tx) =>
      tx.shareLink.create({
        data: { tokenHash: "a".repeat(64), recordType: "isolation_probe", recordId, label: "Isolation link" },
      }),
    appendOnly: true,
    updatableColumn: "revoked_at",
  },
  share_link_open: {
    create: async (tx) => {
      const link = await tx.shareLink.create({
        data: { tokenHash: "b".repeat(64), recordType: "isolation_probe", recordId, label: "Isolation open" },
      });
      return tx.shareLinkOpen.create({ data: { shareLinkId: link.id, ipAddress: "203.0.113.0" } });
    },
    appendOnly: true,
  },
};
