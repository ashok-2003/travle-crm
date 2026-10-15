// The schedules that start jobs (ADR 0010): each with its queue, its cron and its zone. A super admin removes one a job
// left behind once confirmed, never one the console registers at every start (the screen says why); support sees
// them without a way to remove any.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchedulesSection } from "@/console/jobs/schedules-section";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../plans/render-console";

const { schedules: words } = messages.consolePlatform;

const schedules = [
  { queue: "subscriptions.advance-lifecycle", cron: "15 0 * * *", timeZone: "Asia/Kolkata" },
  { queue: "reports.weekly-digest", cron: "0 8 * * 1", timeZone: "Asia/Kolkata" },
];

const itemOf = async (queue: string) => within((await screen.findByText(queue)).closest("li") ?? document.body);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SchedulesSection", () => {
  it("shows each schedule's cron and zone, and why the console's own can't be removed", async () => {
    stubApi({ "platform.jobs.schedules": { data: schedules } });
    renderConsole(<SchedulesSection />);
    const lifecycle = await itemOf("subscriptions.advance-lifecycle");
    expect(lifecycle.getByText("15 0 * * *")).toBeVisible();
    expect(lifecycle.getAllByText("Asia/Kolkata")).not.toHaveLength(0);
    expect(lifecycle.getByText(messages.errors.reasons.SCHEDULE_IS_THE_CONSOLES)).toBeVisible();
    expect(lifecycle.queryByRole("button")).toBeNull();
    const digest = await itemOf("reports.weekly-digest");
    expect(
      digest.getByRole("button", { name: words.removeFor.replace("{queue}", "reports.weekly-digest") }),
    ).toBeVisible();
  });

  it("removes a schedule a job left behind once the super admin confirms", async () => {
    const api = stubApi({ "platform.jobs.schedules": { data: schedules } });
    renderConsole(<SchedulesSection />);
    const digest = await itemOf("reports.weekly-digest");
    await userEvent.click(
      digest.getByRole("button", { name: words.removeFor.replace("{queue}", "reports.weekly-digest") }),
    );
    const confirm = screen.getByRole("alertdialog", {
      name: words.removeTitle.replace("{queue}", "reports.weekly-digest"),
    });
    api.answer("platform.jobs.unschedule", { data: null });
    api.answer("platform.jobs.schedules", { data: schedules.slice(0, 1) });
    await userEvent.click(within(confirm).getByRole("button", { name: words.removeConfirm }));
    expect(await screen.findByText(words.removed.replace("{queue}", "reports.weekly-digest"))).toBeVisible();
    expect(inputsTo("jobs.unschedule")).toEqual([{ queue: "reports.weekly-digest" }]);
    await vi.waitFor(() => {
      expect(screen.queryByText("0 8 * * 1")).toBeNull();
    });
  });

  it("shows the api's sentence when a removal is refused", async () => {
    const api = stubApi({ "platform.jobs.schedules": { data: schedules } });
    renderConsole(<SchedulesSection />);
    const digest = await itemOf("reports.weekly-digest");
    await userEvent.click(
      digest.getByRole("button", { name: words.removeFor.replace("{queue}", "reports.weekly-digest") }),
    );
    api.answer("platform.jobs.unschedule", { status: 403, reason: "SUPER_ADMIN_ONLY" });
    await userEvent.click(screen.getByRole("button", { name: words.removeConfirm }));
    expect(await screen.findByText(messages.errors.reasons.SUPER_ADMIN_ONLY)).toBeVisible();
  });

  it("shows support the schedules, and that only a super admin removes one", async () => {
    stubApi({ "platform.jobs.schedules": { data: schedules } });
    renderConsole(<SchedulesSection />, platformStaff("support"));
    expect(await screen.findByText("reports.weekly-digest")).toBeVisible();
    expect(screen.getByText(words.readOnly)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("says when there are no schedules, and when they didn't load", async () => {
    const api = stubApi({ "platform.jobs.schedules": { status: 403 } });
    renderConsole(<SchedulesSection />);
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("platform.jobs.schedules", { data: [] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText(words.empty)).toBeVisible();
  });
});
