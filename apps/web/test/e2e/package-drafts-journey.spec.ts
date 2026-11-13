// Package drafts (plan 2 of the WhatsApp sales agent rebuild), on a phone and a desktop, against the real api with the fake AI
// (support/fake-openrouter.ts): the Owner gives the AI a knowledge piece about Manali 5N6D and strict rules that print a different
// triple price; "Find trips" lists Manali; "Draft" proposes its values, each with the line it was read from, both triple prices
// offered; Save stays shut until one is chosen; the saved package is a group package with its season, and "AI can sell" is off.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi } from "./support/leads";
import { inAgency } from "./support/whatsapp";

test.use({ actionTimeout: 15_000 });

// The knowledge is piece 1 (lines P1.L1 to P1.L5) and the strict rules piece 2 (P2.L1): the instructions are empty.
const KNOWLEDGE = [
  "Manali 5 Nights 6 Days group package",
  "Triple sharing Rs 6,999/- per person",
  "Double sharing Rs 7,799/- per person",
  "Departures every Friday and Saturday",
  "Advance Rs 2,000/- per person to book",
].join("\n");
const STRICT_RULES = "Manali 5N6D triple sharing is Rs 7,499/- per person";

test("the Owner drafts a group package from the agency's documents, chooses between two triple prices, and saves it", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await callApi(page, "ai.saveSettings", { enabled: true, scoring: true, writeStyle: "warm", instructions: "" });
  await callApi(page, "ai.addKnowledge", { title: "Manali 5N6D", body: KNOWLEDGE });
  // No screen sets strict rules any more, but drafts still read the ones an agency stored: write them as the data.
  await inAgency(agency.organizationId, (tx) =>
    tx.aiAutopilot.upsert({
      where: { organizationId: agency.organizationId },
      create: { strictRules: STRICT_RULES },
      update: { strictRules: STRICT_RULES },
    }),
  );

  await page.goto("/settings/ai");
  const section = page
    .getByRole("heading", { level: 2, name: "Draft packages from your documents" })
    .locator("xpath=ancestor::*[@data-slot='card']");
  await expect(section.getByRole("button", { name: "Find trips" })).toBeVisible({ timeout: 60_000 });
  await section.getByRole("button", { name: "Find trips" }).click();
  await expect(section.getByText("Manali 5 Nights 6 Days")).toBeVisible();
  await expect(section.getByText("From: Knowledge: Manali 5N6D, Strict rules")).toBeVisible();
  await expectAccessible(page);

  await section.getByRole("button", { name: "Draft Manali 5 Nights 6 Days" }).click();
  const dialog = page.getByRole("dialog", { name: "Check the draft package" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Manali 5N6D");
  await expect(
    dialog.getByText("From Knowledge: Manali 5N6D: “Manali 5 Nights 6 Days group package”").first(),
  ).toBeVisible();
  // The documents print two triple prices: both are offered with their lines, and nothing is chosen for the Owner.
  const triple = dialog.getByRole("radio", { name: /₹6,999/ });
  await expect(triple).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /₹7,499/ })).toBeVisible();
  await expect(
    dialog.getByText("From Strict rules: “Manali 5N6D triple sharing is Rs 7,499/- per person”"),
  ).toBeVisible();
  await expectAccessible(page);

  const save = dialog.getByRole("button", { name: "Save as package" });
  await expect(save).toBeDisabled();
  await expect(dialog.getByText("Choose between the options marked above: 1 left.")).toBeVisible();
  await triple.check();
  await expect(save).toBeEnabled();
  expect(await inAgency(agency.organizationId, (tx) => tx.quoteTemplate.count())).toBe(0);
  await save.click();

  // The package editor opens on a group package with the drafted season; the AI may not sell it yet.
  await expect(page).toHaveURL(/\/packages\//);
  await expect(page.getByRole("heading", { level: 1, name: "Manali 5N6D" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "A group trip that departs on set dates" })).toBeChecked();
  const seasons = page.getByRole("region", { name: "Seasons and room prices" });
  await expect(seasons).toContainText("Regular");
  await expect(seasons).toContainText("₹6,999");
  await expect(seasons).toContainText("₹7,799");
  await expect(seasons).not.toContainText("₹7,499");
  await expect(page.getByRole("switch", { name: "AI can sell this package" })).not.toBeChecked();
  await expectAccessible(page);
  const saved = await inAgency(agency.organizationId, (tx) => tx.quoteTemplate.findFirstOrThrow());
  expect(saved.aiSellable).toBe(false);
});
