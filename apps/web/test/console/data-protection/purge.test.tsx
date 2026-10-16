// Deleting an organization for good (spec 5, ADR 0023): offered only once it is cancelled and has an export finished
// in the last day, each condition shown met or not with what to do; then the organization's code typed to confirm.
// The job's result, read from the platform log, is shown when it comes; a refusal shows its sentence, the purge's own
// for a missing export.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { heldAnswer } from "../../support/api-stub";
import { messages } from "@/i18n/messages";
import { inputsTo } from "../plans/render-console";
import { anExport, details, logged, openScreen, organizationId } from "./agency";

const { dataProtection: words } = messages.consolePlatform;
const HOUR = 60 * 60 * 1000;

async function openConfirm() {
  await userEvent.click(await screen.findByRole("button", { name: words.purge.action }));
  return within(
    screen.getByRole("alertdialog", { name: words.purge.confirmTitle.replace("{name}", "Sharma Travels") }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleting the organization for good", () => {
  it("says what stands in the way, and offers it only once nothing does", async () => {
    openScreen({
      "platform.organizations.get": details("active"),
      "platform.dataProtection.exports": {
        data: [anExport({ completedAt: new Date(Date.now() - 30 * HOUR).toISOString() })],
      },
    });
    expect(await screen.findByText(words.purge.notCancelled)).toBeVisible();
    expect(await screen.findByText(words.purge.notExported)).toBeVisible();
    expect(screen.getByRole("button", { name: words.purge.action })).toBeDisabled();
  });

  it("deletes it once the code is typed, and shows the job's result", async () => {
    const api = openScreen({
      "platform.organizations.get": details("cancelled"),
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    expect(await screen.findByText(words.purge.cancelled)).toBeVisible();
    const confirm = await openConfirm();
    const button = confirm.getByRole("button", { name: words.purge.confirm });
    expect(button).toBeDisabled();
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestPurge", { data: { jobId: "0199a000-0000-7000-8000-0000000000ab" } });
    api.answer("platform.log.list", {
      data: {
        entries: [
          logged("organization.purged", { before: { code: "SHARMA" }, after: { rows: 120, people: 3, files: 2 } }),
          logged("organization.purge-requested"),
        ],
        nextCursor: null,
      },
    });
    await userEvent.click(button);
    expect(inputsTo("dataProtection.requestPurge")).toEqual([{ organizationId, confirmation: "SHARMA" }]);
    expect(
      await screen.findByText(
        words.purge.purged.replace("{rows}", "120").replace("{people}", "3").replace("{files}", "2"),
      ),
    ).toBeVisible();
  });

  it("says the job kept the organization, and why", async () => {
    const api = openScreen({
      "platform.organizations.get": details("cancelled"),
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    const confirm = await openConfirm();
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestPurge", { data: { jobId: "0199a000-0000-7000-8000-0000000000ab" } });
    api.answer("platform.log.list", {
      data: {
        entries: [
          logged("organization.purge-skipped", { after: { reason: "no-recent-export", status: "cancelled" } }),
          logged("organization.purge-requested"),
          logged("organization.purged", { after: { rows: 1, people: 1, files: 1 } }),
        ],
        nextCursor: null,
      },
    });
    await userEvent.click(confirm.getByRole("button", { name: words.purge.confirm }));
    expect(await screen.findByText(words.purge.skipped["no-recent-export"])).toBeVisible();
  });

  it("shows a refusal's sentence, the purge's own for a missing export", async () => {
    const api = openScreen({
      "platform.organizations.get": details("cancelled"),
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    const confirm = await openConfirm();
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestPurge", { status: 409, reason: "EXPORT_FIRST" });
    await userEvent.click(confirm.getByRole("button", { name: words.purge.confirm }));
    expect(await confirm.findByText(words.purge.notExported)).toBeVisible();
    expect(confirm.queryByText(messages.errors.reasons.EXPORT_FIRST)).toBeNull();
  });

  it("can't be closed while the request is out, and still shows what follows once it is answered", async () => {
    const api = openScreen({
      "platform.organizations.get": details("cancelled"),
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    const confirm = await openConfirm();
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    const held = heldAnswer({ data: { jobId: "0199a000-0000-7000-8000-0000000000ab" } });
    api.answer("platform.dataProtection.requestPurge", held.answer);
    await userEvent.click(confirm.getByRole("button", { name: words.purge.confirm }));
    expect(confirm.getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    held.release();
    expect(await screen.findByText(words.purge.queued)).toBeVisible();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("refreshes the organization once it is deleted, so nothing more is offered", async () => {
    const api = openScreen({
      "platform.organizations.get": details("cancelled"),
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    const confirm = await openConfirm();
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestPurge", { data: { jobId: "0199a000-0000-7000-8000-0000000000ab" } });
    api.answer("platform.log.list", {
      data: {
        entries: [
          logged("organization.purged", { after: { rows: 1, people: 1, files: 1 } }),
          logged("organization.purge-requested"),
        ],
        nextCursor: null,
      },
    });
    api.answer("platform.organizations.get", { status: 404, reason: "ORGANIZATION_NOT_FOUND" });
    await userEvent.click(confirm.getByRole("button", { name: words.purge.confirm }));
    expect(await screen.findByText(words.deleted)).toBeVisible();
    expect(inputsTo("organizations.get").length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: words.subject.export })).toBeNull();
  });

  it("doesn't misstate a reason it doesn't know", async () => {
    const api = openScreen({
      "platform.organizations.get": details("cancelled"),
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    const confirm = await openConfirm();
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestPurge", { data: { jobId: "0199a000-0000-7000-8000-0000000000ab" } });
    api.answer("platform.log.list", {
      data: {
        entries: [
          logged("organization.purge-skipped", { after: { reason: "new-thing" } }),
          logged("organization.purge-requested"),
        ],
        nextCursor: null,
      },
    });
    await userEvent.click(confirm.getByRole("button", { name: words.purge.confirm }));
    expect(await screen.findByText(words.purge.skipped.unknown)).toBeVisible();
  });

  it("stops asking after ten minutes without a result, and points to the failed jobs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = openScreen({
        "platform.organizations.get": details("cancelled"),
        "platform.dataProtection.exports": { data: [anExport()] },
      });
      const confirm = await openConfirm();
      await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA", {
        delay: null,
      });
      api.answer("platform.dataProtection.requestPurge", { data: { jobId: "0199a000-0000-7000-8000-0000000000ab" } });
      api.answer("platform.log.list", {
        data: { entries: [logged("organization.purge-requested")], nextCursor: null },
      });
      await userEvent.click(confirm.getByRole("button", { name: words.purge.confirm }), { delay: null });
      expect(await screen.findByText(words.purge.queued)).toBeVisible();
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 3000);
      expect(await screen.findByText(new RegExp(words.waitedTooLong))).toBeVisible();
      expect(screen.getByRole("link", { name: words.seeJobs })).toHaveAttribute("href", "/console/jobs");
      const asked = inputsTo("log.list").length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(inputsTo("log.list").length).toBe(asked);
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);
});
