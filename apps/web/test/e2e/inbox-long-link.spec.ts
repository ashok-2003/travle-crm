// A long link never widens the chat (owner, 2026-11-25: on a phone, chats holding a Drive or payment link were wider than the
// screen, every bubble cut at the right): the link wraps inside its bubble, and nothing in the chat reaches past the screen.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { connectNumber, newCustomerNumber, openNewChat } from "./support/whatsapp";

test.use({ actionTimeout: 20_000 });

const drive =
  "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view?usp=sharing_eip_m&ts=6743abcd";
const pay = "https://rzp.io/l/manali-kasol-strangers-trip-advance-payment-5d4n";

test("a chat holding long links stays as wide as a 360px phone, and its links still open", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await signInByEmail(owner, agency.owner);
  const chat = await openNewChat(
    owner,
    business,
    newCustomerNumber(),
    "Meera Rao",
    `Here is the brochure: ${drive} and pay at ${pay}`,
  );

  await expect(chat.getByRole("link", { name: drive })).toHaveAttribute("href", drive);
  await expect(chat.getByRole("link", { name: pay })).toHaveAttribute("href", pay);
  expect(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(
    await chat.evaluate((root) =>
      [...root.querySelectorAll("*")].every((element) => element.getBoundingClientRect().right <= window.innerWidth),
    ),
  ).toBe(true);
  await owner.close();
});
