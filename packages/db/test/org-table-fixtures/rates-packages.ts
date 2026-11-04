// Isolation fixtures for release 7b: a package's seasons (hard-deleted), a supplier's seasons and rates (plain data the runtime role may delete), a package's tiers,
// the agency's public-page settings (kept and changed, never deleted), and the package enquiry ledger (append only for the
// runtime role: the platform role sweeps it).
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aSeason = async (tx: OrgTx) =>
  tx.supplierRateSeason.create({
    data: {
      supplierId: (await tx.supplier.create({ data: { kind: "hotel", name: `Isolation hotel ${randomUUID()}` } })).id,
      label: "Peak",
      startsOn: new Date("2026-12-01"),
      endsOn: new Date("2027-01-15"),
    },
  });

const aPackage = (tx: OrgTx) =>
  tx.quoteTemplate.create({ data: { name: `Isolation ${randomUUID().slice(0, 8)}`, title: "Trip" } });

export const fixtures: OrgTableFixtures = {
  supplier_rate_season: { create: aSeason },
  supplier_rate: {
    create: async (tx) =>
      tx.supplierRate.create({
        data: { seasonId: (await aSeason(tx)).id, item: "Deluxe room", unit: "per_room_night", costPaise: 350000n },
      }),
  },
  package_season: {
    create: async (tx) =>
      tx.packageSeason.create({
        data: {
          templateId: (await aPackage(tx)).id,
          label: "Nov",
          startsOn: new Date("2026-11-01"),
          endsOn: new Date("2026-11-30"),
          priceTriplePaise: 1500000n,
        },
      }),
  },
  quote_template_tier: {
    create: async (tx) =>
      tx.quoteTemplateTier.create({ data: { templateId: (await aPackage(tx)).id, name: "Standard" } }),
  },
  public_page_settings: {
    create: (tx) => tx.publicPageSettings.create({ data: { about: "Isolation" } }),
    undeletable: true,
  },
  package_enquiry: {
    create: async (tx) =>
      tx.packageEnquiry.create({
        data: { submissionId: randomUUID(), packageId: (await aPackage(tx)).id, outcome: "new_lead" },
      }),
    appendOnly: true,
  },
};
