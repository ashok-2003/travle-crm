// Steps several account journeys share: signing in with the organization code through the form, and setting up
// two-factor on the setup screen with the key it shows.
import { expect, type Page } from "@playwright/test";
import { totpCode } from "./totp";

export async function signInWithCode(page: Page, code: string, person: { username: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Organization code" }).click();
  await page.getByRole("textbox", { name: "Organization code" }).fill(code);
  await page.getByRole("textbox", { name: "Username" }).fill(person.username);
  await page.getByLabel("Password").fill(person.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Completes the setup screen and returns the secret, as the person's phone would keep it. */
export async function setUpTwoFactor(page: Page, password: string): Promise<string> {
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  // The key for typing by hand: base32, in groups of four.
  const key = await page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).textContent();
  const secret = (key ?? "").replaceAll(" ", "");
  await page.getByLabel("Then type the 6-digit code the app shows.").fill(totpCode(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await page.getByRole("button", { name: "I've saved them" }).click();
  return secret;
}
