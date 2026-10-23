// Builds what the meta-leads module's tests need: the imports tests' agencies and members, an in-memory Meta Graph with a
// login and a Page, the token box, the rate limiter that keeps the Graph budget, and Pages, forms and ledger rows written
// straight into the tables with no rule, audit entry or event. A test of a rule calls the module's own function instead.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryLogger, type MemoryLogger } from "@travel-crm/integrations/logging";
import {
  createMemoryMetaGraph,
  type MemoryMetaGraph,
  type MetaFormQuestion,
} from "@travel-crm/integrations/meta-graph";
import { createMemorySecretBox } from "@travel-crm/integrations/secret-box";
import type { SecretBox } from "@travel-crm/integrations/secret-box";
import { createRateLimiter } from "../../../src/rate-limits/index.js";
import { sealPageToken } from "../../../src/meta-leads/index.js";
import type { MetaDependencies } from "../../../src/meta-leads/index.js";
import type { DomainEvent, EventListener } from "../../../src/jobs/index.js";
import { newUuidV7 } from "../../../src/kernel/index.js";
import { createTestImports, listenerContext, type TestImports } from "../../imports/support/test-imports.js";

export { anAgency, auditOf, eventsOf, memberOf } from "../../imports/support/test-imports.js";

export const appSecret = "0123456789abcdef0123456789abcdef";
export const redirectUri = "https://app.example.in/settings/lead-sources/meta/callback";

export interface TestMeta extends TestImports {
  graph: MemoryMetaGraph;
  secretBox: SecretBox;
  logger: MemoryLogger;
  dependencies: MetaDependencies;
}

export function createTestMeta(): TestMeta {
  const base = createTestImports();
  const graph = createMemoryMetaGraph();
  const secretBox = createMemorySecretBox();
  const logger = createMemoryLogger();
  const dependencies: MetaDependencies = {
    db: base.db,
    graph,
    secretBox,
    limiter: createRateLimiter(base.db, { keySecret: "rate-limit-key-for-the-meta-tests-0123456789" }),
    login: { appId: "1234567890", appSecret, loginConfigId: "9876543210", redirectUri },
    logger,
  };
  return { ...base, graph, secretBox, logger, dependencies };
}

export const aMetaPageId = () => randomUUID().replaceAll("-", "").slice(0, 15);

export const winterQuestions: MetaFormQuestion[] = [
  { key: "full_name", type: "full_name", label: "Full name" },
  { key: "phone_number", type: "phone", label: "Phone" },
  { key: "email", type: "email", label: "Email" },
  { key: "where_to", type: "custom", label: "Where do you want to go?" },
];

export interface PageSeed {
  connectedBy: string;
  metaPageId?: string;
  pageName?: string;
  status?: string;
  token?: string;
  metaUserId?: string;
  lastCheckedAt?: Date | null;
  formsReadAt?: Date | null;
  attentionSince?: Date | null;
  leadsAdded?: number;
}

/** A running Page connected by `connectedBy`, with its token sealed as the module seals it, unless told otherwise. */
export async function aPage(
  test: TestMeta,
  tx: OrgTx,
  organizationId: string,
  seed: PageSeed,
): Promise<{ id: string; metaPageId: string; token: string }> {
  const id = randomUUID();
  const token = seed.token ?? `page-token-${randomUUID()}`;
  const metaPageId = seed.metaPageId ?? aMetaPageId();
  const status = seed.status ?? "running";
  await tx.metaPage.create({
    data: {
      id,
      pageId: metaPageId,
      pageName: seed.pageName ?? "Yatra Hikes",
      status,
      ...(status === "disconnected"
        ? {}
        : { ...sealPageToken(test.secretBox, token, organizationId, id), tokenKind: "user_long_lived" }),
      metaUserId: seed.metaUserId ?? "meta-user-1",
      connectedBy: seed.connectedBy,
      lastCheckedAt: seed.lastCheckedAt ?? null,
      formsReadAt: seed.formsReadAt ?? null,
      attentionSince: seed.attentionSince ?? null,
      leadsAdded: seed.leadsAdded ?? 0,
    },
  });
  return { id, metaPageId, token };
}

export interface FormSeed {
  formId?: string;
  formName?: string;
  state?: string;
  catchupCursor?: bigint | null;
  skippedLeads?: number;
  questions?: MetaFormQuestion[];
  fields?: Record<string, string | null>;
}

const defaultFields: Record<string, string> = { full_name: "name", phone: "phone", email: "email", custom: "note" };

function fieldOf(seed: FormSeed, question: MetaFormQuestion): string | null {
  const chosen = seed.fields?.[question.key];
  return chosen !== undefined ? chosen : (defaultFields[question.type] ?? "note");
}

/** A form of the Page, brought in unless told otherwise, with its questions matched by their defaults. */
export async function aForm(
  tx: OrgTx,
  pageRowId: string,
  seed: FormSeed = {},
): Promise<{ id: string; formId: string }> {
  const formId = seed.formId ?? randomUUID().replaceAll("-", "").slice(0, 15);
  const state = seed.state ?? "running";
  const form = await tx.metaForm.create({
    data: {
      metaPageId: pageRowId,
      formId,
      formName: seed.formName ?? "Winter ad",
      state,
      catchupCursor:
        seed.catchupCursor === undefined ? (state === "not_brought_in" ? null : 1_761_213_600n) : seed.catchupCursor,
      skippedLeads: seed.skippedLeads ?? 0,
      broughtInAt: state === "not_brought_in" ? null : new Date(),
    },
  });
  if (state !== "not_brought_in") {
    const questions = seed.questions ?? winterQuestions;
    await tx.metaFormQuestion.createMany({
      data: questions.map((question) => ({
        formRowId: form.id,
        questionKey: question.key,
        questionType: question.type,
        label: question.label,
        field: fieldOf(seed, question),
      })),
    });
  }
  return { id: form.id, formId };
}

/** Registers the Page and its forms at the memory Meta, as a login of this person sharing it. */
export function shareWithGraph(
  test: TestMeta,
  login: {
    code: string;
    userId?: string;
    pages: { id: string; name?: string; token: string; canAdvertise?: boolean }[];
  },
): void {
  test.graph.addLogin(login.code, {
    userId: login.userId ?? "meta-user-1",
    pages: login.pages.map((page) => ({
      id: page.id,
      name: page.name ?? "Yatra Hikes",
      token: page.token,
      canAdvertise: page.canAdvertise ?? true,
    })),
  });
}

/** Runs a listener on an event as the worker would, in the organization. */
export function runListener(
  test: TestMeta,
  listener: EventListener,
  organizationId: string,
  event: { type: string; payload: Record<string, string | boolean> },
  id: string = newUuidV7(),
): Promise<void> {
  const domainEvent: DomainEvent = {
    id,
    organizationId,
    type: event.type,
    payload: event.payload,
    occurredAt: new Date(),
  };
  return listener.handle(domainEvent, listenerContext(test, organizationId));
}
