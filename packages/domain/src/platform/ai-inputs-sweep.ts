// The console's nightly sweep of what "Fill it for me" read (the owner, 2026-10-30): a voice recording or a screenshot is
// deleted 30 days after it was uploaded, for good, and the fill that used it forgets it (a customer's or an organization's
// erasure deletes them earlier). Only the platform role may delete an attachment row, which is why this runs in the console
// and not the worker. It lists a page of the old ones across organizations, deletes each organization's in a short platform
// transaction (the rows and a queue of their bytes), then lets the stored files' deletion run for each.
import { AI_INPUT_KEEP_DAYS, AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import { withDeleted } from "@travel-crm/db";
import type { ScheduledJob } from "../jobs/index.js";
import { deleteRecordFiles } from "../files/index.js";
import { deleteFilesAfterCommit } from "./file-deletions.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_AI_INPUTS_QUEUE = "platform.sweep-ai-inputs";

const PAGE = 200;

interface Old {
  organizationId: string;
  recordId: string;
  attachmentIds: string[];
}

/** Deletes the recordings and screenshots past their days; returns how many files went. */
export async function sweepAiInputs(services: PlatformServices, now: Date): Promise<number> {
  const before = new Date(now.getTime() - AI_INPUT_KEEP_DAYS * 86_400_000);
  let deleted = 0;
  const organizations = new Set<string>();
  for (;;) {
    const page = await services.platformDb.transaction(async (tx) => {
      // Unfinished uploads and removed ones too: whatever the organization holds, by age.
      const rows = await withDeleted(() =>
        tx.attachment.findMany({
          where: { recordType: AI_INPUT_RECORD_TYPE, createdAt: { lt: before } },
          orderBy: { createdAt: "asc" },
          take: PAGE,
          select: { organizationId: true, recordId: true, id: true },
        }),
      );
      const records = new Map<string, Old>();
      for (const row of rows) {
        const key = `${row.organizationId}/${row.recordId}`;
        const old = records.get(key) ?? {
          organizationId: row.organizationId,
          recordId: row.recordId,
          attachmentIds: [],
        };
        old.attachmentIds.push(row.id);
        records.set(key, old);
      }
      let count = 0;
      for (const old of records.values()) {
        // The fill that read the file forgets it; it has no key, so nothing blocks the delete.
        await tx.aiFill.updateMany({
          where: { organizationId: old.organizationId, inputAttachmentId: { in: old.attachmentIds } },
          data: { inputAttachmentId: null },
        });
        count += await deleteRecordFiles(
          tx,
          { organizationId: old.organizationId, recordType: AI_INPUT_RECORD_TYPE, recordId: old.recordId },
          now,
        );
        organizations.add(old.organizationId);
      }
      return count;
    });
    deleted += page;
    if (page === 0) break;
  }
  for (const organizationId of organizations) await deleteFilesAfterCommit(services, organizationId, now);
  return deleted;
}

/** Nightly, at 03:30 India time, away from the other sweeps. */
export function aiInputsSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_AI_INPUTS_QUEUE,
    cron: "30 3 * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepAiInputs(services, new Date());
    },
  };
}
