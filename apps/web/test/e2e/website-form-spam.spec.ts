// The traps and the bot check on a visitor's own page (spec 13, journey 5): a filled trap field is dropped with the
// thank-you, a send a second after load is told to try again and passes the second time, a message with three web links is
// refused with its sentence, Turnstile saying no shows the sentence and starts the widget again, and Turnstile that cannot
// answer lets the enquiry in.
import type { Page } from "@playwright/test";
import { expect, signInByEmail, test } from "./support/fixtures";
import {
  fillVisitor,
  keyOf,
  leadsOf,
  leadsOfPhone,
  newPhone,
  openHosted,
  turnOnForm,
  visitorsDevice,
  widgetResets,
} from "./support/website-form";

const send = (page: Page) => page.getByRole("button", { name: "Send enquiry" });

/** Opens the form as a visitor whose Turnstile will judge tokens as `answer`, and waits for Send to be ready. */
async function visitorOn(
  browser: Parameters<typeof visitorsDevice>[0],
  key: string,
  answer: Parameters<typeof visitorsDevice>[1] = "pass",
) {
  const context = await visitorsDevice(browser, answer);
  const page = await openHosted(context, key);
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
  await expect(send(page)).toBeEnabled();
  return page;
}

test("a filled trap field is thanked and dropped", async ({ page, browser, agency }) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const visitor = await visitorOn(browser, key);
  const phone = newPhone();
  await fillVisitor(visitor, { name: "Bot Bhai", phone });
  await visitor.locator('input[name="homepage"]').fill("https://spam.example", { force: true });
  await send(visitor).click();
  await expect(visitor.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  expect(await leadsOfPhone(page, phone)).toEqual([]);
});

test("a send a moment after load is told to try again, and passes the second time", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const visitor = await visitorOn(browser, key);
  const phone = newPhone();
  await fillVisitor(visitor, { name: "Meera Pillai", phone });
  await send(visitor).click();
  await expect(visitor.getByText("Please check your details and press Send again.")).toBeVisible();
  expect(await leadsOfPhone(page, phone)).toEqual([]);
  await visitor.waitForTimeout(2_200);
  await send(visitor).click();
  await expect(visitor.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  expect(await leadsOfPhone(page, phone)).toHaveLength(1);
});

test("a message with three web links is refused with its sentence", async ({ page, browser, agency }) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const visitor = await visitorOn(browser, key);
  await fillVisitor(visitor, { name: "Meera Pillai", phone: newPhone() });
  await visitor
    .getByLabel("Anything else we should know?")
    .fill("see http://one.example then http://two.example and http://three.example");
  await visitor.waitForTimeout(2_200);
  await send(visitor).click();
  await expect(visitor.getByText("Please take the web links out of your message.")).toBeVisible();
  expect(await leadsOf(page)).toEqual([]);
});

test("Turnstile saying no shows the sentence and starts the widget again; Turnstile that cannot answer lets it in", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));

  const refused = await visitorOn(browser, key, "fail");
  const refusedPhone = newPhone();
  await fillVisitor(refused, { name: "Bot Bhai", phone: refusedPhone });
  await refused.waitForTimeout(2_200);
  await send(refused).click();
  await expect(refused.getByText("We couldn't tell you are a person. Please try again.")).toBeVisible();
  await expect.poll(() => widgetResets(refused)).toBeGreaterThanOrEqual(1);
  expect(await leadsOfPhone(page, refusedPhone)).toEqual([]);

  const unreachable = await visitorOn(browser, key, "error");
  const phone = newPhone();
  await fillVisitor(unreachable, { name: "Meera Pillai", phone });
  await unreachable.waitForTimeout(2_200);
  await send(unreachable).click();
  await expect(unreachable.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  expect(await leadsOfPhone(page, phone)).toHaveLength(1);
});
