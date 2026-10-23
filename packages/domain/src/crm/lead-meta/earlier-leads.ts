// The second choice at bring-in (Q3): "also check the last 30 days". The worker reads the form's leads of the last 30 days
// from Meta, writes them as the CSV of an ordinary lead import named after the form ("Rajasthan winter ad · 23 Oct"), and
// starts it for the person who connected the Page, so it reaches the import's preview with its "Already in your CRM"
// group. Leads of the last ten minutes are left to the catch-up (its overlap reads them), so nothing is added twice. The
// import's columns take the fields of the form's questions (matchMetaImportListener), with no matching step.
import { importStepEvent, type ImportField } from "@travel-crm/contracts/imports";
import { metaFormBroughtInEvent } from "@travel-crm/contracts/meta-leads";
import type { Database } from "@travel-crm/db";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { Files } from "../../files/index.js";
import type { Identity } from "../../identity/index.js";
import {
  holdImport,
  IMPORT_KEPT_MS,
  importBatchOf,
  jobMemberAccess,
  matchImportColumns,
  startImportFromBytes,
} from "../../imports/index.js";
import { defineListener, type EventListener } from "../../jobs/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import {
  catchupOverlapSeconds,
  earlierLeadDays,
  formOfPage,
  leadAsRow,
  metaServices,
  openPageToken,
  pageOf,
  storedMatches,
  type QuestionMatch,
} from "../../meta-leads/index.js";
import { uuidFromText } from "../../sheets/index.js";
import { readFormLeads } from "./catch-up-form.js";
import type { MetaProcessDependencies } from "./process-change.js";

export interface EarlierLeadsDependencies extends Omit<MetaProcessDependencies, "identity"> {
  files: Files;
  spreadsheets: Spreadsheets;
  identity: MetaProcessDependencies["identity"] & Pick<Identity, "resolveAccess">;
}

const DAY_SECONDS = 86_400;
/** The most leads one import takes, the bulk import's own limit. */
const MAX_EARLIER_LEADS = 2000;
const ENQUIRY_DATE = "Enquiry date";
const PLATFORM = "Platform";
const platformWords = { facebook: "Facebook", instagram: "Instagram", other: "" } as const;

/** The CSV's columns: the form's questions as a lead reads them, then the lead's day and the platform it came by. */
function columnsOf(matches: readonly QuestionMatch[]): { headers: string[]; fields: (ImportField | null)[] } {
  const row = leadAsRow({ answers: {} }, matches);
  const fields = row.headers.map((_, position): ImportField | null => row.fieldAt.get(position) ?? null);
  return { headers: [...row.headers, ENQUIRY_DATE, PLATFORM], fields: [...fields, "enquiry_date", "their_source"] };
}

/** meta.earlier-leads: on meta.form-brought-in with earlierLeads, the import of the form's last 30 days is made. */
export function earlierLeadsListener(dependencies: EarlierLeadsDependencies): EventListener {
  return defineListener({
    name: "meta.earlier-leads",
    eventType: "meta.form-brought-in",
    payload: metaFormBroughtInEvent,
    handle: async (event, context) => {
      if (!event.payload.earlierLeads) return;
      const services = metaServices(dependencies);
      if (services === null) return;
      const found = await context.forOrg(async (tx) => {
        const page = await pageOf(tx, event.payload.pageId);
        if (page?.status !== "running") return null;
        const form = await formOfPage(tx, page.id, event.payload.formId);
        return { page, form, matches: await storedMatches(tx, form.id) };
      });
      if (found === null) return;
      const { page, form, matches } = found;
      const token = openPageToken(services.secretBox, page);
      if (token === null || form.state === "not_brought_in") return;
      const now = new Date();
      const since = Math.floor(now.getTime() / 1000) - earlierLeadDays * DAY_SECONDS;
      const read = await readFormLeads(dependencies, services.graph, page, form, token, since);
      if (!read.ok) throw new Error(`Meta earlier leads read failed: ${read.failure.reason}`);
      const zone = (await dependencies.identity.organizationProfile(page.organizationId))?.timeZone ?? "Asia/Kolkata";
      const edge = now.getTime() - catchupOverlapSeconds * 1000;
      const columns = columnsOf(matches);
      const known = new Set(matches.map((match) => match.key));
      const leads = read.leads.filter((lead) => lead.createdAt.getTime() < edge).slice(-MAX_EARLIER_LEADS);
      if (leads.length === 0) return;
      const writer = dependencies.spreadsheets.writer({
        kind: "csv",
        sheetName: "Leads",
        columns: columns.headers.map((header) => ({ header, kind: "text" as const })),
      });
      writer.write(
        leads.map((lead) => {
          // Only the questions the form's match lists: a question Meta added since goes to the live leads' notes only.
          const listed = Object.fromEntries(Object.entries(lead.answers).filter(([key]) => known.has(key)));
          const row = leadAsRow({ answers: listed }, matches);
          return [...row.cells, calendarDateIn(lead.createdAt, zone), platformWords[lead.platform] || null];
        }),
      );
      const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: zone }).format(now);
      const title = form.formName.replaceAll(/[\\/:*?"<>|]+|\p{Cc}+/gu, " ").trim() || "Facebook form";
      await startImportFromBytes(
        dependencies.db,
        dependencies.files,
        {
          importId: uuidFromText(`meta-import:${form.id}`),
          organizationId: page.organizationId,
          startedBy: page.connectedBy,
          impersonatedBy: page.impersonatedBy,
          fileName: `${title.slice(0, 150)} · ${day}.csv`,
          bytes: await writer.finish(),
          sourceMetaFormId: form.id,
        },
        now,
      );
    },
  });
}

/**
 * meta.match-import: on import.read, the import of a form's leads needs no matching step, since the questions were
 * matched when the form was brought in. Its columns take those fields, in the CSV's order, and the check starts as the
 * person who connected the Page. A connector who can no longer act ends the import as it would for a file.
 */
export function matchMetaImportListener(dependencies: EarlierLeadsDependencies & { db: Database }): EventListener {
  return defineListener({
    name: "meta.match-import",
    eventType: "import.read",
    payload: importStepEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "leads") return;
      const batch = await context.forOrg((tx) => importBatchOf(tx, event.payload.importId));
      if (batch?.status !== "matching" || batch.sourceMetaFormId === null) return;
      const { sourceMetaFormId } = batch;
      const who = await jobMemberAccess(
        dependencies,
        { organizationId: batch.organizationId, userId: batch.startedBy, impersonatedBy: batch.impersonatedBy },
        ["leads:create", "leads:assign"],
      );
      if ("failure" in who) {
        const now = new Date();
        await context.forOrg(async (tx) => {
          if ((await holdImport(tx, batch.id))?.status !== "matching") return;
          await tx.importBatch.updateMany({
            where: { id: batch.id, status: "matching" },
            data: {
              status: "failed",
              failureReason: who.failure,
              finishedAt: now,
              keepUntil: new Date(now.getTime() + IMPORT_KEPT_MS),
            },
          });
        });
        return;
      }
      const owners = new Set((await dependencies.identity.leadWorkers(batch.organizationId)).map((w) => w.userId));
      await context.forOrg(async (tx) => {
        const matches = await storedMatches(tx, sourceMetaFormId);
        const { fields } = columnsOf(matches);
        const importColumns = await tx.importColumn.findMany({
          where: { batchId: batch.id },
          orderBy: { position: "asc" },
          select: { position: true },
        });
        await matchImportColumns(
          tx,
          who.access,
          "leads",
          {
            importId: batch.id,
            columns: importColumns.map((column) => ({
              position: column.position,
              field: fields[column.position] ?? null,
            })),
            values: [],
            defaults: { stage: "new" },
          },
          { owners, roleKeys: new Set(), now: new Date() },
        );
      });
    },
  });
}
