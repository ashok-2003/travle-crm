// Release 4, journey 1: the Owner switches Lead assignment to Turns with two salespeople on the settings screen, and
// three website enquiries are given out one after another: A, B, A. Each lead's timeline says whose turn it was.
import { expect, signInByEmail, test } from "./support/fixtures";
import { salesTeam, websiteVisitors } from "./support/assignment";
import { timelineOf } from "./support/website-form";

test("the Owner switches to turns with two salespeople and three enquiries go A, B, A", async ({
  page,
  request,
  agency,
  addStaff,
}) => {
  await signInByEmail(page, agency.owner);
  const team = await salesTeam(page, agency, addStaff);
  await page.goto("/settings/assignment");
  await expect(page.getByRole("heading", { level: 1, name: "Lead assignment" })).toBeVisible();
  await page.getByRole("radio", { name: "In turns" }).click();
  await expect(page.getByText("Nobody is in the pool")).toBeVisible();
  await page.getByRole("checkbox", { name: "Priya Nair" }).click();
  await page.getByRole("checkbox", { name: "Ravi Kumar" }).click();
  await expect(page.getByText("Nobody is in the pool")).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Lead assignment saved")).toBeVisible();

  const visitors = await websiteVisitors(page, request);
  const first = await visitors.enquire({ name: "Meera Pillai" });
  const second = await visitors.enquire({ name: "Dev Kapoor" });
  const third = await visitors.enquire({ name: "Anita Rao" });

  const turns = [first, second, third].map((lead) => lead.ownerUserId);
  expect(turns[0]).not.toBeNull();
  expect([team.priya.userId, team.ravi.userId]).toContain(turns[0]);
  expect(turns[1]).not.toBe(turns[0]);
  expect([team.priya.userId, team.ravi.userId]).toContain(turns[1]);
  expect(turns[2]).toBe(turns[0]);

  await page.goto(`/leads/${first.id}`);
  await expect(
    page
      .getByRole("list", { name: "Timeline" })
      .getByText(`Assigned to ${team.nameOf(turns[0] ?? null)}, whose turn it was.`),
  ).toBeVisible();
  const entries = (await timelineOf(page, first.id)).entries;
  expect(entries.find((entry) => entry.kind === "created")).toMatchObject({ assignment: { reason: "turns" } });
});
