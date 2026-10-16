// For the image smoke run (scripts/docker/smoke-images.sh): issues the branding's sample quotation in an organization,
// as documents.issueSample does, so the worker's container renders its PDF with the brand's fonts, as it will an
// agency's documents. Prints the document's id. DATABASE_URL (the runtime role) and ORGANIZATION_ID come from the
// environment.
import { SAMPLE_DOCUMENT_PREFIX } from "@travel-crm/contracts/documents";
import { createDatabase } from "@travel-crm/db";
import { brandedSampleQuotation, issueDocument } from "@travel-crm/domain/documents";
import { systemActor } from "@travel-crm/domain/kernel";

const { DATABASE_URL: databaseUrl, ORGANIZATION_ID: organizationId } = process.env;
if (databaseUrl === undefined || organizationId === undefined) {
  throw new Error("Set DATABASE_URL and ORGANIZATION_ID");
}

const db = createDatabase(databaseUrl, { maxConnections: 1 });
try {
  // Taxed within Maharashtra, with no colour, terms or logo: the ₹ comes from each font's Latin-extended file.
  const sample = brandedSampleQuotation({
    organizationName: "Demo Holidays",
    profile: { gstStateCode: "27", brandColour: null, documentTerms: null },
  });
  const issued = await db.forOrg(organizationId, (tx) =>
    issueDocument(tx, systemActor(organizationId), { ...sample, prefix: SAMPLE_DOCUMENT_PREFIX }),
  );
  console.log(issued.id);
} finally {
  await db.disconnect();
}
