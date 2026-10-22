// A cold start (spec 13, journey 12): the pilot's api sleeps and answers late. The page shows its waiting words, then the
// form, and an enquiry sent while the api is slow arrives once.
import { expect, signInByEmail, test } from "./support/fixtures";
import { fillVisitor, keyOf, leadsOfPhone, newPhone, turnOnForm, visitorsDevice } from "./support/website-form";

const LATE_MS = 8_000;

test("the page says it is getting the form ready, and an enquiry sent to a slow api arrives once", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(90_000);
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const visitor = await visitorsDevice(browser);
  // The api answers the form's GET and POST eight seconds late, as a service waking up does.
  let posts = 0;
  await visitor.route("**/api/public/website-forms/**", async (route) => {
    if (route.request().method() === "POST") posts += 1;
    await new Promise((resolve) => setTimeout(resolve, LATE_MS));
    await route.continue();
  });
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/f/${key}`);
  await expect(visitorPage.getByRole("status").getByLabel("Loading the form")).toBeVisible();
  await expect(visitorPage.getByText("Getting the form ready. This can take a minute.")).toBeVisible({
    timeout: 7_000,
  });
  await expect(visitorPage.getByLabel("Your name", { exact: true })).toBeVisible({ timeout: 15_000 });

  const phone = newPhone();
  await fillVisitor(visitorPage, { name: "Meera Pillai", phone });
  await visitorPage.waitForTimeout(2_200);
  await visitorPage.getByRole("button", { name: "Send enquiry" }).click();
  await expect(visitorPage.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible({ timeout: 20_000 });
  expect(posts).toBe(1);
  expect(await leadsOfPhone(page, phone)).toHaveLength(1);
});
