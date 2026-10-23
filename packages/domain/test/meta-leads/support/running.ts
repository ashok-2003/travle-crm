// A Page that is running with a form brought in, at the memory Meta, for the tests of the webhook's work and the catch-up:
// an agency with an Owner who works leads, the Page's route, and helpers to make a lead at Meta and to deliver it.
import { randomUUID } from "node:crypto";
import type { MemoryLeadInput } from "@travel-crm/integrations/meta-graph";
import type { MetaLeadgenChange } from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import type { MetaProcessDependencies } from "../../../src/crm/index.js";
import { processLeadgenChange } from "../../../src/crm/index.js";
import { upsertRoute } from "../../../src/meta-leads/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import {
  aForm,
  aMetaPageId,
  aPage,
  anAgency,
  memberOf,
  winterQuestions,
  type FormSeed,
  type PageSeed,
  type TestMeta,
} from "./meta.js";

export function crmEntitlements(access: Entitlements["access"] = "full"): Entitlements {
  return {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: new Set(["crm"]),
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000 },
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
  };
}

export const now = new Date("2026-10-23T10:00:00Z");

export interface Running {
  agency: string;
  owner: string;
  member: ReturnType<typeof memberOf>;
  page: { id: string; metaPageId: string; token: string };
  form: { id: string; formId: string };
  dependencies: MetaProcessDependencies;
  /** A lead at Meta, made a minute ago unless told. */
  leadAtMeta(id: string, answers: Record<string, string[]>, more?: Partial<MemoryLeadInput>): void;
  /** The change a delivery for this lead carries. */
  change(leadgenId: string, formId?: string): MetaLeadgenChange;
  /** The webhook's work for a lead, as the worker does it. */
  deliver(leadgenId: string, formId?: string, at?: Date): ReturnType<typeof processLeadgenChange>;
  inOrg<T>(fn: (tx: OrgTx) => Promise<T>): Promise<T>;
  leads(): Promise<
    {
      id: string;
      source: string;
      sourceDetail: string | null;
      note: string | null;
      ownerUserId: string | null;
      returning: boolean;
      createdAt: Date;
      personId: string;
    }[]
  >;
  setAccess(access: Entitlements["access"]): void;
}

export async function aRunningPage(
  test: TestMeta,
  options: { page?: Partial<PageSeed>; form?: FormSeed; budget?: { perHour: number; catchupPerHour: number } } = {},
): Promise<Running> {
  const agency = await anAgency(test);
  const member = memberOf(agency);
  const owner = member.userId;
  let access: Entitlements["access"] = "full";
  const page = await test.db.forOrg(agency, (tx) => aPage(test, tx, agency, { connectedBy: owner, ...options.page }));
  const metaPageId = page.metaPageId;
  test.graph.addLogin(`login-${page.id}`, {
    userId: "meta-user-1",
    pages: [{ id: metaPageId, name: "Yatra Hikes", token: page.token, canAdvertise: true }],
  });
  await test.graph.subscribePage(metaPageId, page.token);
  const formId = options.form?.formId ?? `F-${randomUUID().slice(0, 12)}`;
  test.graph.addForm(metaPageId, {
    id: formId,
    name: options.form?.formName ?? "Winter ad",
    questions: options.form?.questions ?? winterQuestions,
  });
  const form = await test.db.forOrg(agency, (tx) => aForm(tx, page.id, { ...options.form, formId }));
  await upsertRoute(test.db, { metaPageId, organizationId: agency, metaUserId: "meta-user-1", nextCatchupAt: now });
  const dependencies: MetaProcessDependencies = {
    ...test.dependencies,
    ...(options.budget === undefined ? {} : { graphBudget: options.budget }),
    ownerOf: () => Promise.resolve(owner),
    identity: {
      firstOwner: () => Promise.resolve(owner),
      leadWorkers: () => Promise.resolve([{ userId: owner, name: "Owner" }]),
      organizationProfile: () => Promise.resolve({ timeZone: "Asia/Kolkata" } as never),
    },
    subscriptions: { entitlementsOf: () => Promise.resolve(crmEntitlements(access)) },
  };
  const change = (leadgenId: string, forForm = form.formId): MetaLeadgenChange => ({
    leadgenId,
    pageId: metaPageId,
    formId: forForm,
    createdTime: Math.floor(now.getTime() / 1000),
  });
  return {
    agency,
    owner,
    member,
    page,
    form,
    dependencies,
    leadAtMeta: (id, answers, more = {}) => {
      test.graph.addLead({ id, formId: form.formId, answers, createdAt: new Date(now.getTime() - 60_000), ...more });
    },
    change,
    deliver: (leadgenId, forForm, at = now) =>
      processLeadgenChange(dependencies, agency, change(leadgenId, forForm), at),
    inOrg: (fn) => test.db.forOrg(agency, fn),
    leads: async () => {
      const rows = await test.db.forOrg(agency, (tx) =>
        tx.lead.findMany({
          orderBy: { id: "asc" },
          select: {
            id: true,
            source: true,
            sourceDetail: true,
            notes: { select: { body: true }, orderBy: { id: "asc" } },
            ownerUserId: true,
            returning: true,
            createdAt: true,
            personId: true,
          },
        }),
      );
      return rows.map(({ notes, ...row }) => ({ ...row, note: notes[0]?.body ?? null }));
    },
    setAccess: (next) => {
      access = next;
    },
  };
}

export const freshMetaPage = aMetaPageId;
