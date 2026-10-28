// The WhatsApp export reader: a chat from Android's and the iPhone's formats, WhatsApp's own lines dropped, and only the
// chosen staff member's own messages kept for upload, so the customer's side never leaves the browser.
import { describe, expect, it } from "vitest";
import { ownMessagesOf, readWhatsAppExport, sendersOf } from "@/ai/whatsapp-export";

const people = (text: string) => sendersOf(readWhatsAppExport(text)).map((one) => one.name);

describe("readWhatsAppExport", () => {
  it("reads Android's lines, with the narrow space before pm", () => {
    expect(
      people("28/10/26, 9:41 pm - Ayush Mishra: hii\n28/10/26, 9:42 pm - Riya: hello\n28/10/26, 9:42 pm - Riya: ok"),
    ).toEqual(["Riya", "Ayush Mishra"]);
  });

  it("reads 24-hour times, dotted dates and names with emojis", () => {
    expect(people("28.10.2026, 21:41 - Ayush: hi\n28.10.2026, 21:42 - Riya ❤️: hey")).toEqual(["Ayush", "Riya ❤️"]);
  });

  it("reads the iPhone's bracketed lines and drops what WhatsApp wrote", () => {
    const messages = readWhatsAppExport(
      "[28/10/26, 9:41:03 PM] Ayush: hi\n[28/10/26, 9:42:10 PM] Riya: hey\n[28/10/26, 9:43:00 PM] Riya: image omitted",
    );
    expect(messages).toEqual([
      { sender: "Ayush", text: "hi" },
      { sender: "Riya", text: "hey" },
    ]);
  });

  it("reads an unsaved contact's name and joins a message's later lines", () => {
    const messages = readWhatsAppExport("10/28/26, 9:41 PM - ~ Riya: hey\nsecond line\n10/28/26, 9:42 PM - Ayush: hi");
    expect(messages).toEqual([
      { sender: "Riya", text: "hey\nsecond line" },
      { sender: "Ayush", text: "hi" },
    ]);
  });

  it("keeps only the chosen person's own messages: the customer's side is dropped before anything is sent", () => {
    const messages = readWhatsAppExport(
      "28/10/26, 9:41 pm - Customer: my number is 9876543210\n28/10/26, 9:42 pm - Riya: hey\n28/10/26, 9:43 pm - Customer: ok\n28/10/26, 9:44 pm - Riya: done",
    );
    expect(ownMessagesOf(messages, "Riya")).toEqual(["hey", "done"]);
  });
});
