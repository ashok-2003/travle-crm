// The console's jobs (spec 9.1, ADR 0010): support finds a failed job by its queue and runs it again, and it leaves the
// failed list; a super admin removes a schedule a job left behind, once confirmed, while the console's own schedules
// say why they stay. Failed jobs and schedules are the whole platform's, so each journey makes its own, on a queue
// of its own.
import { expect, test } from "./support/console";
import { addFailedJob, addLeftoverSchedule, openConsoleScreen, uniqueSuffix } from "./support/console-platform";

test("support runs a failed job again, and it leaves the failed list", async ({ page, support }) => {
  const queue = `probe.journey-${uniqueSuffix()}`;
  await addFailedJob(queue);
  await openConsoleScreen(page, support, "/console/jobs", "Jobs");
  await page.getByLabel("Queue").fill(queue);
  await page.getByRole("button", { name: "Show this queue" }).click();

  const failed = page.getByRole("main").getByRole("listitem").filter({ hasText: queue });
  await expect(failed).toContainText("1 attempt");
  await expect(failed).toContainText("ProbeError: failed on purpose");
  await failed.getByRole("button", { name: "Run again" }).click();
  await expect(page.getByText("Sent to run again")).toBeVisible();
  await expect(page.getByText(`No failed jobs on ${queue}.`)).toBeVisible();
});

test("a super admin removes a schedule a job left behind, and the console's own stay", async ({ page, superAdmin }) => {
  const queue = `probe.journey-${uniqueSuffix()}`;
  await addLeftoverSchedule(queue);
  await openConsoleScreen(page, superAdmin, "/console/jobs", "Jobs");

  const schedules = page.getByRole("region", { name: "Schedules" });
  // Said once, for the console's own schedules, which have no Remove.
  await expect(schedules).toContainText("The console schedules this job every time it starts");
  await expect(
    schedules.getByRole("listitem").filter({ hasText: "subscriptions.advance-lifecycle" }).getByRole("button"),
  ).toHaveCount(0);
  await schedules.getByRole("button", { name: `Remove the schedule for ${queue}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove schedule" }).click();
  await expect(page.getByText(`The schedule for ${queue} was removed`)).toBeVisible();
  await expect(schedules.getByText(queue)).toHaveCount(0);
});
