// Rules the website form's tables keep themselves (spec 7): the key's shape, one form per organization, the modes and
// links, the two ledgers' grants, and a submission id used once per organization. Every insert runs as the runtime role
// inside forOrg; a refusal is matched by its constraint's name.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import type { OrgTx } from "../src/for-org.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  deleteOrganizationRows,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("the website form's tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let otherOrganizationId: string;
  let formId: string;
  let otherFormId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>, organization = organizationId): Promise<T> =>
    db.forOrg(organization, work);
  const addForm = (data: Partial<Prisma.WebsiteFormUncheckedCreateInput> = {}, organization = organizationId) =>
    inOrg((tx) => tx.websiteForm.create({ data: { keySecret: "AbCdEfGh01234567", ...data } }), organization);
  const addSubmission = (
    data: Partial<Prisma.WebsiteFormSubmissionUncheckedCreateInput> = {},
    organization = organizationId,
    form = organization === organizationId ? formId : otherFormId,
  ) =>
    inOrg(
      (tx) =>
        tx.websiteFormSubmission.create({
          data: { formId: form, submissionId: randomUUID(), outcome: "new_lead", ...data },
        }),
      organization,
    );

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Website form tables");
    otherOrganizationId = await createTestOrganization(platform, "Another agency");
    formId = (await addForm()).id;
    otherFormId = (await addForm({}, otherOrganizationId)).id;
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("starts a form off, with the defaults of W2", async () => {
    const form = await inOrg((tx) => tx.websiteForm.findUniqueOrThrow({ where: { id: formId } }));
    expect(form).toMatchObject({
      enabled: false,
      allowEmbed: true,
      emailMode: "optional",
      destinationMode: "optional",
      travelMonthMode: "optional",
      travellersMode: "optional",
      budgetMode: "off",
      messageMode: "optional",
      offersTickbox: false,
    });
  });

  it("the key secret CHECK refuses a short or illegal secret", async () => {
    for (const keySecret of ["short", "AbCdEfGh012345678", "AbCdEfGh0123456!", "AbCdEfGh 1234567", ""]) {
      await expect(
        db.forOrg(await createTestOrganization(platform), (tx) => tx.websiteForm.create({ data: { keySecret } })),
        keySecret,
      ).rejects.toThrow(/\bwebsite_form_key_secret_shape\b/);
    }
    await expect(
      db.forOrg(await createTestOrganization(platform), (tx) =>
        tx.websiteForm.create({ data: { keySecret: "a-B_c-D_e-F_g-H_" } }),
      ),
    ).resolves.toBeDefined();
  });

  it("refuses a second form for one organization", async () => {
    await expect(addForm()).rejects.toThrow(/\bwebsite_form_one_per_organization\b/);
  });

  it("refuses a mode outside off, optional and required", async () => {
    for (const column of [
      "emailMode",
      "destinationMode",
      "travelMonthMode",
      "travellersMode",
      "budgetMode",
      "messageMode",
    ] as const) {
      await expect(
        inOrg((tx) => tx.websiteForm.update({ where: { id: formId }, data: { [column]: "sometimes" } })),
        column,
      ).rejects.toThrow(/\bwebsite_form_modes_value\b/);
    }
    for (const mode of ["off", "optional", "required"]) {
      await expect(
        inOrg((tx) => tx.websiteForm.update({ where: { id: formId }, data: { messageMode: mode } })),
        mode,
      ).resolves.toBeDefined();
    }
  });

  it("holds the https CHECKs and the length CHECKs", async () => {
    const refusals: [Prisma.WebsiteFormUncheckedUpdateInput, string][] = [
      [{ websiteUrl: "http://example.test" }, "website_form_urls_https"],
      [{ privacyUrl: "javascript:alert(1)" }, "website_form_urls_https"],
      [{ websiteUrl: `https://example.test/${"a".repeat(300)}` }, "website_form_text_lengths"],
      [{ heading: "h".repeat(81) }, "website_form_text_lengths"],
      [{ introduction: "i".repeat(201) }, "website_form_text_lengths"],
      [{ thankYouMessage: "t".repeat(501) }, "website_form_text_lengths"],
      [{ websiteButtonText: "b".repeat(41) }, "website_form_text_lengths"],
    ];
    for (const [data, constraint] of refusals) {
      await expect(
        inOrg((tx) => tx.websiteForm.update({ where: { id: formId }, data })),
        constraint,
      ).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
    await expect(
      inOrg((tx) =>
        tx.websiteForm.update({
          where: { id: formId },
          data: {
            websiteUrl: "https://example.test/book",
            privacyUrl: "https://example.test/privacy",
            heading: "h".repeat(80),
            introduction: "i".repeat(200),
            thankYouMessage: "t".repeat(500),
            websiteButtonText: "b".repeat(40),
          },
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("holds a submission's outcome and reason to their lists", async () => {
    await expect(addSubmission({ outcome: "lost" })).rejects.toThrow(/\bwebsite_form_submission_outcome_value\b/);
    await expect(addSubmission({ outcome: "spam", reason: "robot" })).rejects.toThrow(
      /\bwebsite_form_submission_reason_value\b/,
    );
    await expect(addSubmission({ outcome: "new_lead", reason: "honeypot" })).rejects.toThrow(
      /\bwebsite_form_submission_reason_value\b/,
    );
    for (const outcome of ["new_lead", "repeat_enquiry", "blocked", "duplicate"]) {
      await expect(addSubmission({ outcome }), outcome).resolves.toBeDefined();
    }
    await expect(addSubmission({ outcome: "spam", reason: "honeypot" })).resolves.toBeDefined();
  });

  it("refuses a duplicate submission id in one organization and allows it in another", async () => {
    const submissionId = randomUUID();
    await addSubmission({ submissionId });
    await expect(addSubmission({ submissionId })).rejects.toThrow(/organization_id_submission_id_key|unique/i);
    await expect(addSubmission({ submissionId }, otherOrganizationId)).resolves.toBeDefined();
  });

  it("keeps a submission's lead and person keys inside the organization", async () => {
    await expect(addSubmission({ personId: randomUUID() })).rejects.toThrow(/foreign key/i);
    await expect(addSubmission({ leadId: randomUUID() })).rejects.toThrow(/foreign key/i);
  });

  it("lets an audit entry come from the public with no user, and still wants one from the web", async () => {
    const entry = (source: string, actorUserId: string | null) =>
      inOrg((tx) =>
        tx.auditEntry.create({
          data: { actorUserId, source, action: "website-form.turned-on", entityType: "website_form", entityId: formId },
        }),
      );
    await expect(entry("public", null)).resolves.toBeDefined();
    await expect(entry("web", null)).rejects.toThrow(/\baudit_entry_actor_named\b/);
  });

  it("holds the consent ledger to its lists", async () => {
    const person = await inOrg((tx) =>
      tx.person.create({ data: { name: "Asha", email: `a-${randomUUID()}@example.test` } }),
    );
    const consent = (data: Partial<Prisma.PersonConsentUncheckedCreateInput>) =>
      inOrg((tx) =>
        tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "marketing",
            action: "granted",
            wording: "Send me travel offers and updates from Asha Travels.",
            wordingVersion: 1,
            source: "web_form",
            ...data,
          },
        }),
      );
    const refusals: [Partial<Prisma.PersonConsentUncheckedCreateInput>, string][] = [
      [{ purpose: "research" }, "person_consent_purpose_value"],
      [{ action: "paused" }, "person_consent_action_value"],
      [{ source: "phone" }, "person_consent_source_value"],
      [{ wording: "" }, "person_consent_wording_length"],
      [{ wording: "w".repeat(301) }, "person_consent_wording_length"],
      [{ wordingVersion: 0 }, "person_consent_wording_version_positive"],
    ];
    for (const [data, constraint] of refusals) {
      await expect(consent(data), constraint).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
    await expect(consent({ action: "withdrawn", source: "staff" })).resolves.toBeDefined();
  });

  it("the ledgers refuse UPDATE and DELETE as app_runtime, and the form refuses DELETE", async () => {
    const submission = await addSubmission();
    await expect(
      inOrg((tx) => tx.websiteFormSubmission.update({ where: { id: submission.id }, data: { outcome: "blocked" } })),
    ).rejects.toThrow(/permission denied/i);
    await expect(inOrg((tx) => tx.websiteFormSubmission.delete({ where: { id: submission.id } }))).rejects.toThrow(
      /permission denied/i,
    );
    const consent = await inOrg((tx) => tx.personConsent.findFirstOrThrow());
    await expect(
      inOrg((tx) => tx.personConsent.update({ where: { id: consent.id }, data: { action: "withdrawn" } })),
    ).rejects.toThrow(/permission denied/i);
    await expect(inOrg((tx) => tx.personConsent.delete({ where: { id: consent.id } }))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(inOrg((tx) => tx.websiteForm.delete({ where: { id: formId } }))).rejects.toThrow(/permission denied/i);
    await expect(
      inOrg((tx) => tx.websiteForm.update({ where: { id: formId }, data: { enabled: true } })),
    ).resolves.toMatchObject({ enabled: true });
  });

  it("lets the platform role sweep the ledgers, and a purge takes everything", async () => {
    await platformDb.transaction(async (tx) => {
      await tx.websiteFormSubmission.deleteMany({ where: { organizationId, createdAt: { lt: new Date() } } });
      await tx.personConsent.deleteMany({ where: { organizationId } });
    });
    await expect(inOrg((tx) => tx.websiteFormSubmission.count())).resolves.toBe(0);
    await addSubmission();
    await platformDb.transaction((tx) => deleteOrganizationRows(tx, otherOrganizationId));
    expect(await platform.websiteForm.count({ where: { organizationId: otherOrganizationId } })).toBe(0);
    expect(await platform.websiteFormSubmission.count({ where: { organizationId: otherOrganizationId } })).toBe(0);
  });
});
