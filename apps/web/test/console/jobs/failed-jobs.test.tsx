// The failed-jobs list (spec 9.1): newest first, a page at a time, optionally one queue's, each job with its queue,
// when it failed, its attempts, its data and its error as the api gives them (ids and codes only). Platform staff
// run one again, but not the platform's purge, erasure or export, which are asked for again instead: the screen says
// why. Loading, empty and failed states are honest.
import type { FailedJobOutput } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FailedJobsSection } from "@/console/jobs/failed-jobs-section";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { messages } from "@/i18n/messages";
import { formatDay, formatTime } from "@/lib/format";
import { stubApi, type Answer } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const { jobs: words } = messages.consolePlatform;
/** Each Run again names the queue and job it runs again. */
const retryName = (queue = "documents.render-pdf", id = "0199a000-0000-7000-8000-0000000000b1") =>
  words.retryFor.replace("{queue}", queue).replace("{id}", id);

function job(overrides: Partial<FailedJobOutput> = {}): FailedJobOutput {
  return {
    id: "0199a000-0000-7000-8000-0000000000b1",
    queue: "documents.render-pdf",
    data: {
      organizationId: "0199a000-0000-7000-8000-000000000002",
      documentId: "0199a000-0000-7000-8000-0000000000d1",
    },
    attempts: 6,
    failedAt: "2026-10-14T10:00:00.000Z",
    error: "StorageError: NoSuchBucket",
    ...overrides,
  };
}

function open(failed: Answer) {
  screenIs("wide");
  const api = stubApi({ "platform.jobs.failed": failed });
  renderConsole(<FailedJobsSection />, platformStaff("support"));
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FailedJobsSection", () => {
  it("shows each failed job's queue, when it failed, its attempts, data and error", async () => {
    open({ data: { jobs: [job()], nextCursor: null } });
    const item = (await screen.findByText("documents.render-pdf")).closest("li");
    const shown = within(item ?? document.body);
    const failedAt = new Date(job().failedAt ?? "");
    const day = formatDay(failedAt, { timeZone: PLATFORM_TIME_ZONE });
    expect(shown.getByText(`${day}, ${formatTime(failedAt, { timeZone: PLATFORM_TIME_ZONE })}`)).toBeVisible();
    expect(shown.getByText("attempts", { exact: false })).toHaveTextContent("6 attempts");
    expect(shown.getByText("documentId")).toBeVisible();
    expect(shown.getByText("0199a000-0000-7000-8000-0000000000d1")).toBeVisible();
    expect(shown.getByText("StorageError: NoSuchBucket")).toBeVisible();
    expect(inputsTo("jobs.failed")).toEqual([{ limit: 25 }]);
  });

  it("says when a job's failure has no time", async () => {
    open({ data: { jobs: [job({ failedAt: null, data: {} })], nextCursor: null } });
    expect(await screen.findByText(words.noTime)).toBeVisible();
    expect(screen.getByText(words.noData)).toBeVisible();
  });

  it("runs a failed job again and refreshes the list", async () => {
    const api = open({ data: { jobs: [job()], nextCursor: null } });
    await screen.findByText("documents.render-pdf");
    api.answer("platform.jobs.retry", { data: null });
    api.answer("platform.jobs.failed", { data: { jobs: [], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: retryName() }));
    expect(await screen.findByText(words.retried)).toBeVisible();
    expect(inputsTo("jobs.retry")).toEqual([{ queue: "documents.render-pdf", jobId: job().id }]);
    expect(await screen.findByText(words.empty)).toBeVisible();
  });

  it("says why the platform's purge, erasure and export aren't run again", async () => {
    open({
      data: {
        jobs: [
          job({ id: "0199a000-0000-7000-8000-0000000000b2", queue: "platform.purge-organization" }),
          job({ id: "0199a000-0000-7000-8000-0000000000b3", queue: "platform.erase-subject" }),
          job({ id: "0199a000-0000-7000-8000-0000000000b4", queue: "platform.export-organization" }),
        ],
        nextCursor: null,
      },
    });
    await screen.findByText("platform.purge-organization");
    const buttons = screen.getAllByRole("button", { name: /^Run again: / });
    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(
      screen.getByRole("button", { name: retryName("platform.erase-subject", "0199a000-0000-7000-8000-0000000000b3") }),
    ).toBeDisabled();
    expect(screen.getAllByText(messages.errors.reasons.NOT_RETRYABLE)).toHaveLength(3);
  });

  it("shows the api's sentence when a retry is refused", async () => {
    const api = open({ data: { jobs: [job()], nextCursor: null } });
    await screen.findByText("documents.render-pdf");
    api.answer("platform.jobs.retry", { status: 404, reason: "FAILED_JOB_NOT_FOUND" });
    await userEvent.click(screen.getByRole("button", { name: retryName() }));
    expect(await screen.findByText(messages.errors.reasons.FAILED_JOB_NOT_FOUND)).toBeVisible();
  });

  it("shows one queue's failed jobs, and every queue again", async () => {
    const api = open({ data: { jobs: [job()], nextCursor: null } });
    await screen.findByText("documents.render-pdf");
    api.answer("platform.jobs.failed", { data: { jobs: [], nextCursor: null } });
    await userEvent.click(screen.getByLabelText(words.queue));
    await userEvent.paste("identity.send-invite");
    await userEvent.click(screen.getByRole("button", { name: words.filter }));
    expect(await screen.findByText(words.emptyQueue.replace("{queue}", "identity.send-invite"))).toBeVisible();
    expect(inputsTo("jobs.failed")).toContainEqual({ limit: 25, queue: "identity.send-invite" });

    api.answer("platform.jobs.failed", { data: { jobs: [job()], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: words.allQueues }));
    expect(await screen.findByText("documents.render-pdf")).toBeVisible();
  });

  it("says what a queue's name looks like before anything is sent", async () => {
    open({ data: { jobs: [job()], nextCursor: null } });
    await screen.findByText("documents.render-pdf");
    await userEvent.click(screen.getByLabelText(words.queue));
    await userEvent.paste("Render PDF");
    await userEvent.click(screen.getByRole("button", { name: words.filter }));
    expect(await screen.findByText(words.queueInvalid)).toBeVisible();
    expect(inputsTo("jobs.failed")).toEqual([{ limit: 25 }]);
  });

  it("shows the next page below the first, asked for after the page's last job", async () => {
    const first = job();
    const cursor = { failedAt: first.failedAt, id: first.id };
    const api = open({ data: { jobs: [first], nextCursor: cursor } });
    await screen.findByText("documents.render-pdf");
    api.answer("platform.jobs.failed", {
      data: {
        jobs: [job({ id: "0199a000-0000-7000-8000-0000000000b9", queue: "identity.send-invite" })],
        nextCursor: null,
      },
    });
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    expect(await screen.findByText("identity.send-invite")).toBeVisible();
    expect(screen.getByText("documents.render-pdf")).toBeVisible();
    expect(inputsTo("jobs.failed")).toEqual([{ limit: 25 }, { limit: 25, after: cursor }]);
    expect(screen.queryByRole("button", { name: words.showMore })).toBeNull();
  });

  it("says when the failed jobs didn't load, and loads them on Try again", async () => {
    const api = open({ status: 403 });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("platform.jobs.failed", { data: { jobs: [job()], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText("documents.render-pdf")).toBeVisible();
  });
});
