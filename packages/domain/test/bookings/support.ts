// Setup for the bookings tests: an agency's lead with an accepted quote, and the people who work on it.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { inject } from "vitest";
import { createBookingFromQuote } from "../../src/bookings/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { aLead } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

export interface World {
  platform: PlatformClient;
  db: Database;
  organizationId: string;
  /** The lead's owner: a salesperson who sees and edits their own bookings. */
  seller: MemberAccess;
  /** Sees every booking and edits them. */
  manager: MemberAccess;
  /** Records payments on every quote. */
  accounts: MemberAccess;
  inOrg: <T>(work: (tx: OrgTx) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

export async function openWorld(name: string): Promise<World> {
  const urls = inject("dbUrls");
  const platform = createPlatformClient(urls.platform);
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const organizationId = await createTestOrganization(platform, name);
  const member = (key: string) => memberWithStarterRole(key, { organizationId, userId: randomUUID() });
  return {
    platform,
    db,
    organizationId,
    seller: member("sales"),
    manager: member("org-admin"),
    accounts: memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() }),
    inOrg: (work) => db.forOrg(organizationId, work),
    close: async () => {
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export interface QuoteSeed {
  ownerUserId: string;
  totalPaise?: number;
  startDate?: string | null;
  adults?: number;
  children?: number;
  days?: number;
  status?: "sent" | "accepted";
}

/** A lead with a quote: accepted unless told it is only sent. */
export async function aQuote(tx: OrgTx, seed: QuoteSeed) {
  const lead = await aLead(tx, { ownerUserId: seed.ownerUserId, stage: "booking_requested" });
  const status = seed.status ?? "accepted";
  const total = seed.totalPaise ?? 100_000_00;
  const quote = await tx.quote.create({
    data: {
      leadId: lead.id,
      title: "Spiti 6 days",
      status,
      startDate:
        seed.startDate === undefined
          ? new Date("2026-12-20")
          : seed.startDate === null
            ? null
            : new Date(`${seed.startDate}T00:00:00Z`),
      adults: seed.adults ?? 2,
      children: seed.children ?? 0,
      days: Array.from({ length: seed.days ?? 3 }, (_, index) => ({
        title: `Day ${String(index + 1)}`,
        description: "",
      })),
      subtotalPaise: BigInt(total),
      totalPaise: BigInt(total),
      ...(status === "accepted" ? { acceptedAt: new Date("2026-10-29T05:00:00Z"), acceptedName: "Rahul Sharma" } : {}),
    },
    select: { id: true, leadId: true },
  });
  return { lead, quote };
}

/** An accepted quote and the booking made from it, as the listener makes it. */
export async function aBooking(world: World, seed: Partial<QuoteSeed> & { confirmed?: boolean; now?: Date } = {}) {
  const { quote, lead } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId, ...seed }));
  const bookingId = await world.inOrg((tx) =>
    createBookingFromQuote(
      tx,
      { organizationId: world.organizationId, quoteId: quote.id, confirmed: seed.confirmed ?? false },
      seed.now ?? new Date("2026-10-29T06:30:00Z"),
    ),
  );
  if (bookingId === null) throw new Error("The booking was not made");
  return { bookingId, quoteId: quote.id, leadId: lead.id };
}
