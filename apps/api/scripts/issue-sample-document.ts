// For the image smoke run (scripts/docker/smoke-images.sh): issues the sample quotation in an organization, so the
// worker's container renders its PDF with the brand's fonts, as it will an agency's documents. Prints the document's
// id. DATABASE_URL (the runtime role) and ORGANIZATION_ID come from the environment.
import { createDatabase } from "@travel-crm/db";
import { issueDocument, sampleQuotation } from "@travel-crm/domain/documents";
import { money, systemActor } from "@travel-crm/domain/kernel";

const { DATABASE_URL: databaseUrl, ORGANIZATION_ID: organizationId } = process.env;
if (databaseUrl === undefined || organizationId === undefined) {
  throw new Error("Set DATABASE_URL and ORGANIZATION_ID");
}

const db = createDatabase(databaseUrl, { maxConnections: 1 });
try {
  const issued = await db.forOrg(organizationId, (tx) =>
    issueDocument(
      tx,
      systemActor(organizationId),
      sampleQuotation({
        recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
        supplierStateCode: "27",
        placeOfSupplyStateCode: "27",
        // Tour operator services, in rupees and paise: the ₹ comes from each font's Latin-extended file.
        lines: [
          {
            description: "Andaman islands, 6 nights",
            sacCode: "998555",
            taxableValue: money(12_50_000_00),
            rateBasisPoints: 500,
          },
        ],
        branding: { organizationName: "Demo Holidays" },
      }),
    ),
  );
  console.log(issued.id);
} finally {
  await db.disconnect();
}
