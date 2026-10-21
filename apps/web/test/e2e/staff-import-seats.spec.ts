// Spec 12.1's journey 7, staff import over the seats (B45, bulk plan Task 3.8): a file that adds more people than the
// plan has seats free turns Add off and says why, and the api refuses it too.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";
import { teamRows, walkToPreview } from "./support/staff-import";

test("a staff file over the seat limit: Add is off with the sentence, and the api refuses it too", async ({
  page,
  agency,
  database,
}) => {
  // A plan of 3 seats, the Owner using one: 2 free for a file of 5.
  const plan = await database.platform.plan.create({
    data: {
      key: `seats-${agency.code.toLowerCase()}`,
      name: "Three seats (tests)",
      monthlyPricePaise: 0,
      seatLimit: 3,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000_000_000n,
      modules: [...planModules],
    },
  });
  await database.platform.subscription.update({
    where: { organizationId: agency.organizationId },
    data: { planId: plan.id },
  });
  await signInByEmail(page, agency.owner);
  const importId = await walkToPreview(page, teamRows(agency.code));

  const message =
    "This file adds 5 people, and your plan has 2 seats free. Leave some rows out, or ask us about more seats.";
  await expect(page.getByRole("main").getByText(message)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add 5 people" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "ask us about more seats" })).toHaveAttribute("href", /^mailto:/);
  await animationsSettled(page);
  await expectAccessible(page);

  // The same refusal from the api, for a call that doesn't come from the screen.
  const refused = await page.request.post("/api/trpc/staffImports.add", {
    data: { importId, attemptId: crypto.randomUUID() },
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(refused.ok()).toBe(false);
  const body = (await refused.json()) as { error: { data: { reason: string } } };
  expect(body.error.data.reason).toBe("IMPORT_OVER_SEAT_LIMIT");
});
