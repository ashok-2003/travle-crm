// "Ask your reports" (release ai2b), on a phone and a desktop, against the real api and worker with the
// fake AI (support/fake-openrouter.ts: it answers one report per question). The AI proposes, a person decides:
// - a question about Instagram leads is answered by the sources report with "I understood this as", and the range can change;
// - a question no report answers is declined with three suggestions.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput } from "./support/leads";

const shots = path.join(process.cwd(), "..", "..", "shots", "ai2b1");
const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";
const fakeOpenRouter = () => process.env.E2E_AI_URL ?? "";

/** A picture of the screen at the sizes the review looks at (a phone 390 wide, a desktop 1440), then the journey's own size again. */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(shots, { recursive: true });
  const before = page.viewportSize();
  await page.setViewportSize(isPhone(testInfo) ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(shots, `${testInfo.project.name}-${name}.png`) });
  if (before !== null) await page.setViewportSize(before);
}

const turnOnAi = (page: Page) => callApi(page, "ai.saveSettings", { enabled: true, scoring: true });

/** What the fake AI was sent by the feature whose rules start with `marker`. */
async function requestsOf(marker: string): Promise<string[]> {
  const all = (await (await fetch(`${fakeOpenRouter()}/_requests`)).json()) as {
    body: { messages: { content: unknown }[] };
  }[];
  return all
    .filter((one) => JSON.stringify(one.body.messages[0]?.content).includes(marker))
    .map((one) => JSON.stringify(one.body.messages));
}

test("a question is answered by the right report, with its range changed, and one no report answers is declined", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await turnOnAi(page);
  await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Secret Customer", phone: "+919811122233" }, source: "instagram" }),
  );
  await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Other Person", phone: "+919811122244" }, source: "website" }),
  );

  await page.goto("/reports");
  await page.getByLabel("Your question").fill("How many leads came from Instagram last month?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  // Understood as the sources report, last month: nothing arrived last month, so the range is changed to this month.
  await expect(page.getByText("I understood this as:")).toBeVisible();
  await expect(page.getByText("Leads by source, last month")).toBeVisible();
  await expect(page.getByText("Nothing in this report for that period.")).toBeVisible();
  await page.getByRole("radio", { name: "this month", exact: true }).click();
  await expect(page.getByText("Leads by source, this month")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Instagram" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Website" })).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "ask-answer");

  // What the AI was sent: the question and the catalogue, and none of the agency's data.
  const [sent] = (await requestsOf("ASK_REPORT.")).slice(-1);
  expect(sent).toContain("How many leads came from Instagram last month?");
  expect(sent).toContain("leads_by_source");
  expect(sent).not.toMatch(/Secret Customer|9811122233|Other Person/);

  // A question the reports can't answer: declined, with the three nearest questions they can.
  await page.getByLabel("Your question").fill("What will the weather be in Manali next week?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("I can't answer that one")).toBeVisible();
  await expect(page.getByRole("button", { name: "Why do we lose leads?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How many quotes were sent and accepted?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How did we do overall?" })).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "ask-declined");
  await page.getByRole("button", { name: "Why do we lose leads?" }).click();
  await expect(page.getByText("Lost leads by reason")).toBeVisible();
});
