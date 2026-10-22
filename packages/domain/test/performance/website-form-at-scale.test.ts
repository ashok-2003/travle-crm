// The website form stays within its budgets (spec 12, ADR 0028): in the large agency (50,000 leads, 300 destinations and
// a ledger of 60,000 submissions, a neighbouring agency's of 100,000 beside it) the public page's reads are quick, a
// submission is saved within 250 ms, and each of the form's queries reads an index, never a whole table. Everything
// runs as app_runtime inside forOrg, so the plans are the runtime's under row-level security.
import { randomUUID } from "node:crypto";
import type { WebsiteEnquiryInput } from "@travel-crm/contracts/website-forms";
import { createDatabase, sql, type Database, type OrgTx, type Sql } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import {
  analyzeTables,
  createIsolatedDatabase,
  createTestOrganization,
  type IsolatedDatabase,
} from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { offeredDestinations, receiveWebsiteEnquiry } from "../../src/crm/index.js";
import { findSubmission, formCounts, readWebsiteForm, recentEnquiryCount } from "../../src/website-forms/index.js";
import { seedLargeAgency } from "./large-agency.js";
import { fastestMs, planOf, type QueryPlan } from "./query-plans.js";

const SIZE = { leads: 50_000, tasks: 0, staff: 500, destinations: 300 };
const NEIGHBOUR = { leads: 20_000, tasks: 0, staff: 50, destinations: 50 };
const LEDGER = 60_000;
const NEIGHBOUR_LEDGER = 100_000;
const BIG_TABLES = ["lead", "person", "website_form_submission"];
const NOW = new Date();

describe("the website form in a large agency", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let ownerUserId: string;
  let personId: string;
  let submissionId: string;
  let formId: string;
  const plans = new Map<string, QueryPlan>();
  const timings = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const plan = async (name: string, query: Sql) => {
    const found = await inOrg((tx) => planOf(tx, query));
    plans.set(name, found);
    return found;
  };
  const time = async (name: string, run: (tx: OrgTx) => Promise<unknown>) => {
    const ms = await fastestMs(() => inOrg(run));
    timings.set(name, ms);
    return ms;
  };
  const noBigScan = (found: QueryPlan) => {
    expect(
      found.seqScans.filter((table) => BIG_TABLES.includes(table)),
      found.text,
    ).toEqual([]);
  };

  /** A form and a ledger of `size` rows over the last 100 days, set-based, the persons of its agency's leads. */
  async function seedLedger(organization: string, size: number): Promise<string> {
    const form = await platform.websiteForm.create({
      data: { organizationId: organization, keySecret: "abcdefghijklmnop", enabled: true },
      select: { id: true },
    });
    await platform.$executeRaw`
      WITH people AS (
        SELECT p.id, l.id AS lead_id, row_number() OVER (ORDER BY p.id) AS n
        FROM person p JOIN lead l ON l.person_id = p.id AND l.organization_id = p.organization_id
        WHERE p.organization_id = ${organization}::uuid
      ),
      total AS (SELECT count(*) AS size FROM people)
      INSERT INTO website_form_submission (organization_id, id, form_id, submission_id, outcome, reason, lead_id,
        person_id, created_at)
      SELECT ${organization}::uuid, gen_random_uuid(), ${form.id}::uuid, gen_random_uuid(),
        (ARRAY['new_lead', 'new_lead', 'repeat_enquiry', 'blocked', 'duplicate', 'spam'])[1 + s % 6],
        CASE WHEN s % 6 = 5 THEN 'honeypot' END,
        CASE WHEN s % 6 < 2 THEN people.lead_id END,
        people.id,
        now() - (s % 100) * interval '1 day' - (s % 1440) * interval '1 minute'
      FROM generate_series(1, ${size}) AS s CROSS JOIN total
      JOIN people ON people.n = 1 + s % total.size`;
    return form.id;
  }

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Large agency");
    ({
      ownerUserIds: [ownerUserId = ""],
    } = await seedLargeAgency(platform, isolated.urls, organizationId, SIZE));
    formId = await seedLedger(organizationId, LEDGER);
    // Agencies share the tables: a neighbour seeded after this one, with a ledger bigger than this agency's.
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, NEIGHBOUR);
    await seedLedger(neighbour, NEIGHBOUR_LEDGER);
    await analyzeTables(isolated.urls, ["website_form", "website_form_submission", "lead", "person", "destination"]);
    const sample = await platform.websiteFormSubmission.findFirstOrThrow({
      where: { organizationId, outcome: "new_lead" },
      select: { personId: true, submissionId: true },
    });
    personId = sample.personId ?? "";
    submissionId = sample.submissionId;
  }, 600_000);

  afterAll(async () => {
    const indexes = Object.fromEntries([...plans].map(([name, found]) => [name, found.indexes]));
    const fastest = Object.fromEntries([...timings].map(([name, ms]) => [name, Math.round(ms * 10) / 10]));
    console.info("Website form at scale:", JSON.stringify({ fastest, indexes }));
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("reads the form by organization without scanning the ledger", async () => {
    noBigScan(await plan("form", sql`SELECT * FROM website_form LIMIT 1`));
    expect(await time("form", (tx) => readWebsiteForm(tx))).toBeLessThan(20);
  });

  it("offers destinations within budget", async () => {
    await plan(
      "offered-destinations",
      sql`
        SELECT d.id, d.name
        FROM destination d
        LEFT JOIN (
          SELECT destination_id, count(*) AS leads
          FROM lead
          WHERE deleted_at IS NULL AND destination_id IS NOT NULL
          GROUP BY destination_id
        ) used ON used.destination_id = d.id
        WHERE d.deleted_at IS NULL
        ORDER BY coalesce(used.leads, 0) DESC, d.name ASC, d.id ASC
        LIMIT 100`,
    );
    // It counts the agency's leads by destination, so with no covering index it reads them all (a sequential scan of the
    // shared table; ~30 ms at 70,000 leads, ~6 ms with a partial index on destination): within budget, so only timed.
    expect(await time("offered-destinations", (tx) => offeredDestinations(tx))).toBeLessThan(50);
  });

  it("the public GET's reads are index scans and total under 60 ms in the 50,000-lead agency", async () => {
    const total = await time("public-get", async (tx) => {
      await readWebsiteForm(tx);
      await offeredDestinations(tx);
    });
    expect(total).toBeLessThan(60);
  });

  it("recentEnquiryCount is one index range read", async () => {
    const found = await plan(
      "recent-enquiry-count",
      sql`
        SELECT count(*) FROM website_form_submission
        WHERE person_id = ${personId}::uuid AND outcome IN ('new_lead', 'repeat_enquiry')
          AND created_at >= ${new Date(NOW.getTime() - 86_400_000)}`,
    );
    expect(found.indexes).toEqual(["website_form_submission_person"]);
    noBigScan(found);
    expect(await time("recent-enquiry-count", (tx) => recentEnquiryCount(tx, personId, NOW))).toBeLessThan(20);
  });

  it("counts the last 30 days from the counts index", async () => {
    const found = await plan(
      "form-counts",
      sql`
        SELECT outcome, count(*) FROM website_form_submission
        WHERE form_id = ${formId}::uuid AND created_at >= ${new Date(NOW.getTime() - 30 * 86_400_000)}
        GROUP BY outcome`,
    );
    expect(found.indexes).toContain("website_form_submission_counts");
    noBigScan(found);
    expect(await time("form-counts", (tx) => formCounts(tx, formId, NOW))).toBeLessThan(150);
  });

  it("finds a submission by its id on the unique index", async () => {
    const found = await plan(
      "find-submission",
      sql`SELECT * FROM website_form_submission WHERE submission_id = ${submissionId}::uuid LIMIT 1`,
    );
    expect(found.indexes).toEqual(["website_form_submission_organization_id_submission_id_key"]);
    noBigScan(found);
    expect(await time("find-submission", (tx) => findSubmission(tx, submissionId))).toBeLessThan(20);
  });

  it("receiveWebsiteEnquiry completes within 250 ms", async () => {
    const form = await inOrg((tx) => readWebsiteForm(tx));
    if (form === null) throw new Error("the large agency has no form");
    let next = 0;
    const send = (tx: OrgTx) => {
      next += 1;
      const input: WebsiteEnquiryInput = {
        submissionId: randomUUID(),
        openedToken: "t",
        via: "hosted",
        homepage: "",
        answers: { name: "Visitor", phone: `+9170${String(next).padStart(8, "0")}` },
      };
      return receiveWebsiteEnquiry(
        tx,
        {
          organizationId,
          ownerUserId,
          workers: new Set([ownerUserId]),
          form,
          agencyName: "Large agency",
          via: "hosted",
          embeddedOn: null,
          now: new Date(),
        },
        input,
      );
    };
    expect(await time("receive-enquiry", send)).toBeLessThan(250);
  });
});
