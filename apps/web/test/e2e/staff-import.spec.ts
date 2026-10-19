// Spec 12.1's journey 6, staff import (bulk plan, Task 3.8): a manager brings in a team from a file, adds it, and
// downloads the passwords shown once; one of the new people signs in with the organization code and must choose a
// password; and coming back to the page without the passwords offers new ones for those who haven't signed in.
import { readFile } from "node:fs/promises";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";
import { signInWithCode } from "./support/sign-in-with-code";
import { shownPasswords, teamRows, walkToPreview } from "./support/staff-import";
import { waitForImportStatus } from "./support/imports";

test("import five staff with roles, download the passwords; one signs in with the organization code and must choose a password", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await walkToPreview(page, teamRows(agency.code));
  await expect(page.getByRole("main").getByText("Adds 5 people: your plan has 999 seats free.")).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);

  await page.getByRole("button", { name: "Add 5 people" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Add 5 people?" });
  await expect(confirm.getByText("Each gets a temporary password, shown once on the next screen.")).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);
  await confirm.getByRole("button", { name: "Add 5 people" }).click();

  await waitForImportStatus(page, /5 people added/);
  await expect(page.getByText("Download these passwords now")).toBeVisible();
  const passwords = await shownPasswords(page);
  expect(passwords).toHaveLength(5);
  await animationsSettled(page);
  await expectAccessible(page);

  // The sheet is written by the browser from its memory, with the passwords and the organization code.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the passwords (.csv)" }).click();
  const sheet = await readFile(await (await download).path(), "utf8");
  expect(sheet.startsWith('﻿"Name","Username","Email","Temporary password","Organization code","Sign-in page"')).toBe(
    true,
  );
  expect(sheet).toContain(`"Kavita Rao","kavita","kavita.rao.${agency.code.toLowerCase()}@example.test"`);
  for (const password of passwords) expect(sheet).toContain(`"${password}"`);
  expect(sheet).toContain(`"${agency.code}"`);
  await expect(page.getByRole("button", { name: "Downloaded" })).toBeEnabled();

  // Kavita, on her own device, signs in with the code and her username, and must choose a password first.
  const kavitasPassword = await page
    .getByRole("row", { name: /Kavita Rao/ })
    .or(page.getByRole("listitem").filter({ hasText: "Kavita Rao" }))
    .locator(".numbers")
    .first()
    .textContent();
  const phone = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "" });
  await signInWithCode(phone.request, { orgCode: agency.code, username: "kavita", password: kavitasPassword ?? "" });
  const me = await phone.request.get("/api/trpc/me.get");
  expect(((await me.json()) as { result: { data: { pendingStep: string } } }).result.data.pendingStep).toBe(
    "CHANGE_PASSWORD",
  );
  await phone.close();

  // The people are on the Staff screen, with their phones and the flag until they choose their own password.
  await page.goto("/staff");
  await expect(page.getByText("Kavita Rao")).toBeVisible();
  await expect(page.getByText("Must change password")).toHaveCount(5);
});

test("coming back without the passwords offers new ones for the people who haven't signed in", async ({
  page,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await walkToPreview(page, teamRows(agency.code));
  await page.getByRole("button", { name: "Add 5 people" }).click();
  await page.getByRole("alertdialog", { name: "Add 5 people?" }).getByRole("button", { name: "Add 5 people" }).click();
  await waitForImportStatus(page, /5 people added/);
  const first = await shownPasswords(page);
  // The passwords live in this tab's memory: a reload forgets them for good.
  await page.reload();
  await expect(page.getByText(/These passwords were shown once/)).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Make new passwords for 5 people" }).click();
  await expect(page.getByText("Download these passwords now")).toBeVisible();
  const second = await shownPasswords(page);
  expect(second).toHaveLength(5);
  for (const password of second) expect(first).not.toContain(password);
});
