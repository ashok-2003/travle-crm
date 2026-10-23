// The Meta lead ads' tables (ADR 0034): a Page's token fields come as a set, a Page is live once per agency but may be
// connected again after disconnecting, a brought-in form has a cursor, the ledger is unique per Meta lead and agency, the
// runtime role never deletes a Page, a form or a ledger row, and the Page route (outside row-level security) is unique
// across agencies, hidden from every organization transaction and reached only in db.withoutOrg() through metaRoutes.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { UnscopedModelError } from "../src/errors.js";
import type { IdentityTx, OrgTx } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityClient, type IdentityDatabase } from "../src/identity.js";
import { metaRoutes } from "../src/meta-routes.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const user = "0199e7a0-0000-7000-8000-0000000000b1";
const reachFor = (tx: object, model: string) => Promise.resolve(Reflect.get(tx, model) as unknown);
const pageData = (pageId = randomUUID()) => ({
  pageId,
  pageName: "Yatra Hikes",
  metaUserId: "meta-user-1",
  connectedBy: user,
});
const sealed = () => ({
  tokenCiphertext: new Uint8Array(32),
  tokenNonce: new Uint8Array(12),
  tokenKeyVersion: 7,
  tokenKind: "user_long_lived",
});

describe("the Meta lead ads' tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identity: IdentityDatabase;
  let organizationId: string;
  let otherId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    identity = createIdentityDatabase(urls.runtime, { maxConnections: 1 });
    organizationId = await createTestOrganization(platform, "Meta tables");
    otherId = await createTestOrganization(platform, "Meta tables other");
  });

  afterAll(async () => {
    await identity.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  describe("meta_page", () => {
    it("keeps the token fields together, and a running or paused Page holds a token", async () => {
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaPage.create({ data: { ...pageData(), tokenCiphertext: new Uint8Array(32) } }),
        ),
      ).rejects.toThrow(/meta_page_token_set/);
      await expect(
        db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: { ...pageData(), status: "running" } })),
      ).rejects.toThrow(/meta_page_running_has_token/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaPage.create({ data: { ...pageData(), ...sealed(), tokenNonce: new Uint8Array(8) } }),
        ),
      ).rejects.toThrow(/meta_page_token_set/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaPage.create({ data: { ...pageData(), ...sealed(), status: "running" } }),
        ),
      ).resolves.toBeDefined();
    });

    it("refuses a status or token kind outside its list", async () => {
      await expect(
        db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: { ...pageData(), status: "weird" } })),
      ).rejects.toThrow(/meta_page_status_value/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaPage.create({ data: { ...pageData(), ...sealed(), tokenKind: "forever" } }),
        ),
      ).rejects.toThrow(/meta_page_token_kind_value/);
    });

    it("is live once per agency, and may be connected again once disconnected", async () => {
      const pageId = randomUUID();
      const first = await db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: pageData(pageId) }));
      await expect(db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: pageData(pageId) }))).rejects.toThrow(
        /meta_page_live/,
      );
      await db.forOrg(organizationId, (tx) =>
        tx.metaPage.update({ where: { id: first.id }, data: { status: "disconnected", disconnectedAt: new Date() } }),
      );
      await expect(
        db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: pageData(pageId) })),
      ).resolves.toBeDefined();
    });

    it("is never deleted by the runtime role, and is deleted by the platform role", async () => {
      const page = await db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: pageData() }));
      await expect(db.forOrg(organizationId, (tx) => tx.metaPage.delete({ where: { id: page.id } }))).rejects.toThrow();
      await platform.metaPage.delete({ where: { id: page.id } });
    });
  });

  describe("meta_form", () => {
    it("needs a cursor once brought in, and keeps a form id once per agency", async () => {
      const page = await db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: pageData() }));
      const formId = randomUUID();
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaForm.create({ data: { metaPageId: page.id, formId, formName: "Winter", state: "running" } }),
        ),
      ).rejects.toThrow(/meta_form_cursor/);
      await db.forOrg(organizationId, (tx) =>
        tx.metaForm.create({
          data: { metaPageId: page.id, formId, formName: "Winter", state: "running", catchupCursor: 1_761_213_600n },
        }),
      );
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaForm.create({ data: { metaPageId: page.id, formId, formName: "Again" } }),
        ),
      ).rejects.toThrow(/meta_form_key/);
    });

    it("cannot point at another agency's Page", async () => {
      const page = await db.forOrg(otherId, (tx) => tx.metaPage.create({ data: pageData() }));
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaForm.create({ data: { metaPageId: page.id, formId: randomUUID(), formName: "Stolen" } }),
        ),
      ).rejects.toThrow();
    });

    it("refuses a question whose type or field is outside its list", async () => {
      const page = await db.forOrg(organizationId, (tx) => tx.metaPage.create({ data: pageData() }));
      const form = await db.forOrg(organizationId, (tx) =>
        tx.metaForm.create({ data: { metaPageId: page.id, formId: randomUUID(), formName: "Q" } }),
      );
      const question = { formRowId: form.id, questionKey: "q1", label: "Q?" };
      await expect(
        db.forOrg(organizationId, (tx) => tx.metaFormQuestion.create({ data: { ...question, questionType: "dance" } })),
      ).rejects.toThrow(/meta_form_question_type_value/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaFormQuestion.create({ data: { ...question, questionType: "custom", field: "salary" } }),
        ),
      ).rejects.toThrow(/meta_form_question_field_value/);
      await db.forOrg(organizationId, (tx) =>
        tx.metaFormQuestion.create({ data: { ...question, questionType: "custom", field: "note" } }),
      );
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaFormQuestion.create({ data: { ...question, questionType: "custom" } }),
        ),
      ).rejects.toThrow(/meta_form_question_key/);
    });
  });

  describe("meta_lead", () => {
    it("is unique on the Meta lead id per agency, but another agency may hold the same id", async () => {
      const metaLeadId = randomUUID();
      const row = { metaLeadId, formId: "f1", status: "added" };
      await db.forOrg(organizationId, (tx) => tx.metaLead.create({ data: row }));
      await expect(db.forOrg(organizationId, (tx) => tx.metaLead.create({ data: row }))).rejects.toThrow(
        /meta_lead_key/,
      );
      await expect(db.forOrg(otherId, (tx) => tx.metaLead.create({ data: row }))).resolves.toBeDefined();
    });

    it("keeps its status, reasons and example within their limits", async () => {
      const base = { formId: "f1", status: "not_added" };
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaLead.create({ data: { ...base, metaLeadId: randomUUID(), status: "odd" } }),
        ),
      ).rejects.toThrow(/meta_lead_status_value/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaLead.create({ data: { ...base, metaLeadId: randomUUID(), reasons: ["because"] } }),
        ),
      ).rejects.toThrow(/meta_lead_reasons_value/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaLead.create({ data: { ...base, metaLeadId: randomUUID(), exampleName: "x".repeat(121) } }),
        ),
      ).rejects.toThrow(/meta_lead_example_length/);
      await expect(
        db.forOrg(organizationId, (tx) =>
          tx.metaLead.create({
            data: { ...base, metaLeadId: randomUUID(), reasons: ["phone_invalid"], platform: "instagram" },
          }),
        ),
      ).resolves.toBeDefined();
    });

    it("is never deleted by the runtime role", async () => {
      const row = await db.forOrg(organizationId, (tx) =>
        tx.metaLead.create({ data: { metaLeadId: randomUUID(), formId: "f1", status: "added" } }),
      );
      await expect(db.forOrg(organizationId, (tx) => tx.metaLead.delete({ where: { id: row.id } }))).rejects.toThrow();
    });
  });

  describe("meta_page_route", () => {
    it("is hidden from OrgTx, IdentityTx and the identity client, and refused past the types", async () => {
      const hidden = (tx: OrgTx, identityTx: IdentityTx, client: IdentityClient): unknown[] => [
        // @ts-expect-error the route has no row-level security, so OrgTx leaves it out
        tx.metaPageRoute,
        // @ts-expect-error IdentityTx reaches the sign-in tables, not the route
        identityTx.metaPageRoute,
        // @ts-expect-error nor the client Better Auth uses
        client.metaPageRoute,
      ];
      expect(typeof hidden).toBe("function");
      await expect(db.forOrg(organizationId, (tx) => reachFor(tx, "metaPageRoute"))).rejects.toBeInstanceOf(
        UnscopedModelError,
      );
      await expect(identity.forOrg(organizationId, (tx) => reachFor(tx, "metaPageRoute"))).rejects.toBeInstanceOf(
        UnscopedModelError,
      );
      await expect(db.withoutOrg((tx) => reachFor(tx, "metaPageRoute"))).rejects.toBeInstanceOf(UnscopedModelError);
      expect(() => Reflect.get(identity.client, "metaPageRoute") as unknown).toThrow(UnscopedModelError);
      await expect(db.forOrg(organizationId, (tx) => metaRoutes(tx).count())).rejects.toBeInstanceOf(
        UnscopedModelError,
      );
    });

    it("is reached in db.withoutOrg() through metaRoutes, with grants of select, insert, update and delete", async () => {
      const pageId = randomUUID();
      await db.withoutOrg((tx) =>
        metaRoutes(tx).create({ data: { pageId, organizationId, metaUserId: "u1", nextCatchupAt: new Date() } }),
      );
      expect(await db.withoutOrg((tx) => metaRoutes(tx).count({ where: { pageId } }))).toBe(1);
      await db.withoutOrg((tx) => metaRoutes(tx).update({ where: { pageId }, data: { claimedUntil: new Date() } }));
      const held = await platform.$queryRaw<{ privilege: string }[]>`
        SELECT p.privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p(privilege)
        WHERE has_table_privilege('app_runtime', 'public.meta_page_route', p.privilege) ORDER BY 1`;
      expect(held.map((row) => row.privilege)).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
      await db.withoutOrg((tx) => metaRoutes(tx).delete({ where: { pageId } }));
    });

    it("keeps a Page to one agency across all agencies (M4)", async () => {
      const pageId = randomUUID();
      await db.withoutOrg((tx) =>
        metaRoutes(tx).create({ data: { pageId, organizationId, metaUserId: "u1", nextCatchupAt: new Date() } }),
      );
      await expect(
        db.withoutOrg((tx) =>
          metaRoutes(tx).create({
            data: { pageId, organizationId: otherId, metaUserId: "u2", nextCatchupAt: new Date() },
          }),
        ),
      ).rejects.toThrow(/meta_page_route_page/);
      await db.withoutOrg((tx) => metaRoutes(tx).deleteMany({ where: { pageId } }));
    });

    it("finds the Pages of a Meta user, for the deletion callback", async () => {
      const metaUserId = randomUUID();
      const pages = [randomUUID(), randomUUID()];
      await db.withoutOrg(async (tx) => {
        await metaRoutes(tx).create({
          data: { pageId: pages[0] ?? "", organizationId, metaUserId, nextCatchupAt: new Date() },
        });
        await metaRoutes(tx).create({
          data: { pageId: pages[1] ?? "", organizationId: otherId, metaUserId, nextCatchupAt: new Date() },
        });
      });
      const found = await db.withoutOrg((tx) =>
        metaRoutes(tx).findMany({ where: { metaUserId }, orderBy: { pageId: "asc" } }),
      );
      expect(found.map((row) => row.organizationId).sort()).toEqual([organizationId, otherId].sort());
      await db.withoutOrg((tx) => metaRoutes(tx).deleteMany({ where: { metaUserId } }));
    });

    it("lets the platform role read and delete it", async () => {
      const pageId = randomUUID();
      await db.withoutOrg((tx) =>
        metaRoutes(tx).create({ data: { pageId, organizationId, metaUserId: "u1", nextCatchupAt: new Date() } }),
      );
      expect(await platform.metaPageRoute.count({ where: { pageId } })).toBe(1);
      await platform.metaPageRoute.delete({ where: { pageId } });
    });
  });
});
