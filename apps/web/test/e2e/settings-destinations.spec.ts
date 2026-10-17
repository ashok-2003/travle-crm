// Merging destinations (spec 3.6, R34): an Owner reaches Destinations from Settings, finds the one to keep by searching
// in the merge dialog, and merges "Goa trip" into "Goa"; the toast says one lead moved, "Goa trip" leaves the list, and
// its lead now reads Goa. axe checks the Destinations screen itself and the merge dialog.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, leadInput } from "./support/leads";
import { animationsSettled } from "./support/settled";

test("merging two destinations moves the lead", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Goa" } } }));
  const leadId = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Sneha Iyer", phone: "+919845011234" },
      trip: { destination: { kind: "new", name: "Goa trip" } },
    }),
  );

  await page.goto("/settings");
  await page.getByRole("link", { name: /^Destinations/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Destinations" })).toBeVisible();
  const list = page.getByRole("list", { name: "Destinations" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await animationsSettled(page);
  await expectAccessible(page);

  await page.getByRole("button", { name: "Actions for Goa trip" }).click();
  await page.getByRole("menuitem", { name: "Merge into another" }).click();
  const merging = page.getByRole("dialog", { name: "Merge Goa trip into another" });
  await merging.getByRole("combobox", { name: "Keep" }).click();
  await page.getByRole("combobox", { name: "Search destinations" }).fill("goa");
  await page.getByRole("option", { name: "Goa", exact: true }).click();
  await expect(merging.getByRole("combobox", { name: "Keep" })).toHaveText("Goa");
  await animationsSettled(page);
  await expectAccessible(page);
  await merging.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByText("Merged. 1 lead moved to Goa.")).toBeVisible();
  await expect(merging).toBeHidden();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByText("Goa trip")).toHaveCount(0);

  await page.goto(`/leads/${leadId}`);
  const trip = page.getByRole("region", { name: "Trip" });
  await expect(trip.getByText("Goa", { exact: true })).toBeVisible();
});
