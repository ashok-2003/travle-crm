// A chat file's link (audit 1): a photo, video, voice note or PDF opens in place, any other file is saved, and a Download
// always saves. The link names the file's size, for the document card.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tinyPng } from "@travel-crm/integrations/testing";
import { copyMedia, mediaLinkOf } from "../../src/inbox/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

describe("a chat file's link", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function storedFile(contentType: "image" | "document", fileContentType: string, bytes: Uint8Array) {
    const connection = await aConnectedAgency(test);
    const url = `https://media.example/${fileContentType.replace("/", "-")}`;
    await deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), contentType, url }));
    const message = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    test.provider.addFile(url, { bytes, contentType: fileContentType });
    expect(await copyMedia(test.dependencies, connection.organizationId, message.id, testNow)).toBe("stored");
    return { member: memberOf(connection.organizationId), messageId: message.id };
  }

  it("opens a photo in place, and saves it when the person asks to download", async () => {
    const { member, messageId } = await storedFile("image", "image/png", tinyPng);
    const opened = await mediaLinkOf(test.dependencies, member, messageId);
    expect(opened.url).toContain("inline=1");
    expect(opened).toMatchObject({ contentType: "image/png", sizeBytes: tinyPng.byteLength });
    const saved = await mediaLinkOf(test.dependencies, member, messageId, { download: true });
    expect(saved.url).not.toContain("inline=1");
  });

  it("opens a PDF in place and saves a file the browser cannot show", async () => {
    const pdf = await storedFile("document", "application/pdf", new TextEncoder().encode("%PDF-1.3 itinerary"));
    expect((await mediaLinkOf(test.dependencies, pdf.member, pdf.messageId)).url).toContain("inline=1");
    const sheet = await storedFile(
      "document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      new Uint8Array(8),
    );
    expect((await mediaLinkOf(test.dependencies, sheet.member, sheet.messageId)).url).not.toContain("inline=1");
  });
});
