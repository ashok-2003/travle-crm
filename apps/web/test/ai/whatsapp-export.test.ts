// The WhatsApp export reader: both sides of a chat from Android's and the iPhone's formats, WhatsApp's own lines dropped.
import { describe, expect, it } from "vitest";
import { conversationOf, readWhatsAppExport, sendersOf } from "@/ai/whatsapp-export";

const people = (text: string) => sendersOf(readWhatsAppExport(text)).map((one) => one.name);

describe("readWhatsAppExport", () => {
  it("reads Android's lines, with the narrow space before pm", () => {
    expect(
      people("28/10/26, 9:41 pm - Ayush Mishra: hii\n28/10/26, 9:42 pm - Riya: hello\n28/10/26, 9:42 pm - Riya: ok"),
    ).toEqual(["Riya", "Ayush Mishra"]);
  });

  it("reads 24-hour times, dotted dates and names with emojis", () => {
    expect(people("28.10.2026, 21:41 - Ayush: hi\n28.10.2026, 21:42 - Riya ❤️: hey")).toEqual(["Ayush", "Riya ❤️"]);
  });

  it("reads the iPhone's bracketed lines and drops what WhatsApp wrote", () => {
    const messages = readWhatsAppExport(
      "‎[28/10/26, 9:41:03 PM] Ayush: hi\n[28/10/26, 9:42:10 PM] Riya: hey\n‎[28/10/26, 9:43:00 PM] Riya: ‎image omitted",
    );
    expect(messages).toEqual([
      { sender: "Ayush", text: "hi" },
      { sender: "Riya", text: "hey" },
    ]);
  });

  it("reads an unsaved contact's name and joins a message's later lines", () => {
    const messages = readWhatsAppExport("10/28/26, 9:41 PM - ~ Riya: hey\nsecond line\n10/28/26, 9:42 PM - Ayush: hi");
    expect(messages).toEqual([
      { sender: "Riya", text: "hey\nsecond line" },
      { sender: "Ayush", text: "hi" },
    ]);
  });

  it("sends both sides in order, the chosen person's marked", () => {
    const messages = readWhatsAppExport("28/10/26, 9:41 pm - Ayush: hi\n28/10/26, 9:42 pm - Riya: hey");
    expect(conversationOf(messages, "Riya")).toEqual([
      { own: false, text: "hi" },
      { own: true, text: "hey" },
    ]);
  });
});
