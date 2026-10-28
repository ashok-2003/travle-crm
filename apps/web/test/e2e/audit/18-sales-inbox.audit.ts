// The visual audit's sales inbox tools (PR 11, part 1): a chat with the automatic welcome, a quick reply, a tag, a team note
// with the mention list, a message to send later, the chat's menu with Snooze, the inbox under Snoozed, and the settings that
// hold the quick replies, tags and automatic answers. The chats are made through the product against the fake MSG91.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { connectNumber, inAgency, newCustomerNumber, openContactDetails, openNewChat } from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
// A step that finds nothing fails in seconds, not at the end of the test's ten minutes.
test.use({ actionTimeout: 30_000 });

test("Sales inbox tools: chat, quick replies, notes, send later, snooze and the settings", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(600_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  // What the Owner set up in Settings, WhatsApp: the saved answers, and a welcome for a number writing for the first time.
  await inAgency(agency.organizationId, async (tx) => {
    await tx.inboxQuickReply.createMany({
      data: [
        { shortcut: "price", title: "Price list", body: "Hi {name}, our Kerala packages start at ₹30,000 a person." },
        { shortcut: "itinerary", title: "Itinerary", body: "Hi {name}, I will send the day-by-day plan shortly." },
        {
          shortcut: "payment",
          title: "Payment details",
          body: "UPI: sharmatravels@upi. Please share a screenshot once paid.",
        },
      ],
    });
    await tx.inboxAutomation.create({
      data: {
        welcomeEnabled: true,
        welcomeMessage: "Namaste! Thank you for writing to Sharma Travels. We will reply shortly.",
      },
    });
    await tx.inboxKeywordReply.create({
      data: { keyword: "brochure", reply: "Our brochure: sharmatravels.example/brochure" },
    });
  });
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Rahul Mehta", "Do you have a Kerala package?");
  await expect(chat.getByText("Automatic reply")).toBeVisible({ timeout: 90_000 });

  // The details beside the chat (a sheet on a phone): the tag.
  const newTag = owner.getByRole("textbox", { name: "New tag" });
  if (!(await newTag.isVisible())) await openContactDetails(owner, chat);
  await newTag.fill("Honeymoon");
  await owner.getByRole("button", { name: "Add the tag" }).click();
  await expect(
    owner.getByRole("toolbar", { name: "Tags" }).getByRole("button", { name: "Honeymoon", pressed: true }),
  ).toBeVisible();
  const sheet = owner.getByRole("dialog");
  const phoneSheet = await sheet.isVisible();
  if (phoneSheet) await shoot(owner, "inbox-tools-chat");
  if (phoneSheet) await sheet.getByRole("button", { name: "Close" }).click();

  // A quick reply, sent.
  const box = chat.getByRole("combobox", { name: "Message" });
  await box.fill("/");
  await expect(chat.getByRole("option", { name: /Price list/ })).toBeVisible();
  await shoot(owner, "inbox-tools-quick-replies");
  await box.fill("/pri");
  await box.press("Enter");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByRole("img", { name: "Sent" }).last()).toBeVisible({ timeout: 60_000 });
  if (!phoneSheet) await shoot(owner, "inbox-tools-chat");

  // A team note with a mention.
  await chat.getByRole("radio", { name: "Note" }).click();
  const note = chat.getByRole("combobox", { name: "A note for your team" });
  await note.fill("Honeymoon trip, wants the houseboat night. @");
  await expect(owner.getByRole("option").first()).toBeVisible();
  await shoot(owner, "inbox-tools-note-mention");
  await note.fill("Honeymoon trip, wants the houseboat night. Call back after 6 pm.");
  await chat.getByRole("button", { name: "Save the note" }).click();
  await expect(chat.getByText("Call back after 6 pm.")).toBeVisible();
  await shoot(owner, "inbox-tools-note-saved");
  await chat.getByRole("radio", { name: "Reply" }).click();

  // Send later.
  await box.fill("Here is the quote we discussed.");
  await chat.getByRole("button", { name: "Send later" }).click();
  await expect(owner.getByText("Send this message later")).toBeVisible();
  await shoot(owner, "inbox-tools-send-later");
  await owner.getByRole("button", { name: /^In an hour/ }).click();
  await expect(chat.getByRole("list", { name: "Messages scheduled for later" })).toBeVisible();
  await shoot(owner, "inbox-tools-scheduled");

  // Snooze.
  await chat.getByRole("button", { name: "More for this chat" }).click();
  await owner.getByRole("menuitem", { name: "Snooze" }).click();
  await expect(owner.getByRole("menuitem", { name: /For an hour/ })).toBeVisible();
  await shoot(owner, "inbox-tools-chat-menu");
  // The camera moved the pointer away, which closed the submenu: open it again.
  await owner.getByRole("menuitem", { name: "Snooze" }).click();
  await owner.getByRole("menuitem", { name: /For an hour/ }).click();
  await expect(owner.getByText(/Snoozed until/)).toBeVisible();
  await owner.goto("/inbox");
  await owner.getByRole("radio", { name: /^Snoozed/ }).click();
  await expect(owner.getByRole("link", { name: /Rahul Mehta/ })).toBeVisible({ timeout: 30_000 });
  await shoot(owner, "inbox-tools-snoozed-list");

  await owner.goto("/settings/whatsapp");
  await expect(owner.getByRole("heading", { name: "Automatic answers" })).toBeVisible();
  await expect(owner.getByText("Price list")).toBeVisible();
  await shoot(owner, "settings-whatsapp-inbox");
  await owner.close();
});
