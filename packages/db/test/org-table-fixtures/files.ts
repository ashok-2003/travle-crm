// Isolation fixtures for the files module: attachments.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  attachment: {
    create: (tx) =>
      tx.attachment.create({
        data: {
          recordType: "isolation_check",
          recordId: "0199e7a0-0000-7000-8000-0000000000f1",
          fileName: "isolation.pdf",
          contentType: "application/pdf",
          sizeBytes: 1,
        },
      }),
  },
};
