// Ads that bring chats: noted on the chat while the first message is processed, one row per ad however many chats it brings,
// linked by the agency to one of its own packages, which the chat then answers with.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adPackageOf, adsOf, linkAd } from "../../src/inbox/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  type TestConnection,
  type TestInbox,
} from "./support.js";

describe("ads that bring chats", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const referral = { source_id: "120210", headline: "Goa in December", source_url: "https://fb.me/x" };
  const write = (connection: TestConnection, extra: object = {}) => {
    const phone = freshPhone();
    return deliver(test, {
      ...fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Hi, is this available?" }),
      ...extra,
    }).then(() => phone);
  };
  const aPackage = (organizationId: string, name = "Goa") =>
    test.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name, title: name }, select: { id: true } }).then((row) => row.id),
    );
  const chatOf = (organizationId: string, phone: string) =>
    test.db.forOrg(organizationId, (tx) => tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: phone } }));

  it("notes the ad and sets it on the chat", async () => {
    const connection = await aConnectedAgency(test);
    const phone = await write(connection, { referral });
    const chat = await chatOf(connection.organizationId, phone);
    const ads = await test.db.forOrg(connection.organizationId, (tx) => adsOf(tx));
    expect(ads).toEqual([
      expect.objectContaining({
        id: chat.adId,
        headline: "Goa in December",
        sourceUrl: "https://fb.me/x",
        packageId: null,
        chats: 1,
      }),
    ]);
  });

  it("reuses the row for a second chat from the same ad", async () => {
    const connection = await aConnectedAgency(test);
    await write(connection, { referral });
    await write(connection, { referral: { ...referral, headline: "Goa, new copy" } });
    const ads = await test.db.forOrg(connection.organizationId, (tx) => adsOf(tx));
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ chats: 2, headline: "Goa, new copy" });
  });

  it("keys on the headline, lower-cased, when there is no source id", async () => {
    const connection = await aConnectedAgency(test);
    await write(connection, { referral: { headline: "Spiti Winter" } });
    await write(connection, { referral: { headline: "spiti winter" } });
    const rows = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappAd.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adKey: "headline:spiti winter" });
  });

  it("changes nothing for a message without a referral, and keeps a chat's first ad", async () => {
    const connection = await aConnectedAgency(test);
    const plain = await write(connection);
    expect(await test.db.forOrg(connection.organizationId, (tx) => adsOf(tx))).toEqual([]);
    expect((await chatOf(connection.organizationId, plain)).adId).toBeNull();
    const phone = await write(connection, { referral });
    const first = (await chatOf(connection.organizationId, phone)).adId;
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Again" }),
      referral: { source_id: "999", headline: "Another ad" },
    });
    expect((await chatOf(connection.organizationId, phone)).adId).toBe(first);
    expect(await test.db.forOrg(connection.organizationId, (tx) => adsOf(tx))).toHaveLength(2);
  });

  it("links an ad to a package of the agency, and the chat answers with it", async () => {
    const connection = await aConnectedAgency(test);
    const phone = await write(connection, { referral });
    const chat = await chatOf(connection.organizationId, phone);
    const packageId = await aPackage(connection.organizationId);
    const member = memberOf(connection.organizationId, "org-admin");
    expect(await test.db.forOrg(connection.organizationId, (tx) => adPackageOf(tx, chat.id))).toBeNull();
    await test.db.forOrg(connection.organizationId, (tx) => linkAd(tx, member, { adId: chat.adId ?? "", packageId }));
    expect(await test.db.forOrg(connection.organizationId, (tx) => adPackageOf(tx, chat.id))).toBe(packageId);
    const audit = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "whatsapp-ad.linked" } }),
    );
    expect(audit.entityId).toBe(chat.adId);
    await test.db.forOrg(connection.organizationId, (tx) =>
      linkAd(tx, member, { adId: chat.adId ?? "", packageId: null }),
    );
    expect(await test.db.forOrg(connection.organizationId, (tx) => adPackageOf(tx, chat.id))).toBeNull();
  });

  it("refuses another agency's package, and an ad that isn't the agency's", async () => {
    const connection = await aConnectedAgency(test);
    const other = await aConnectedAgency(test);
    const phone = await write(connection, { referral });
    const adId = (await chatOf(connection.organizationId, phone)).adId ?? "";
    const foreign = await aPackage(other.organizationId);
    const member = memberOf(connection.organizationId, "org-admin");
    await expect(
      test.db.forOrg(connection.organizationId, (tx) => linkAd(tx, member, { adId, packageId: foreign })),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
    const otherMember = memberOf(other.organizationId, "org-admin");
    await expect(
      test.db.forOrg(other.organizationId, (tx) => linkAd(tx, otherMember, { adId, packageId: null })),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("stores the message and the cleaned ad when a field holds a NUL character", async () => {
    const connection = await aConnectedAgency(test);
    const phone = await write(connection, { referral: { headline: "a\u0000b" } });
    const { messages, ads } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      messages: await tx.whatsappMessage.count(),
      ads: await tx.whatsappAd.findMany(),
    }));
    expect(messages).toBe(1);
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ headline: "ab", adKey: "headline:ab" });
    expect((await chatOf(connection.organizationId, phone)).adId).toBe(ads[0]?.id);
  });

  it("stores the message and no ad when every field of the referral cleans to nothing", async () => {
    const connection = await aConnectedAgency(test);
    await write(connection, { referral: { headline: "\u0000", source_id: "\u0001 ", source_url: "\u0002" } });
    const { messages, ads } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      messages: await tx.whatsappMessage.count(),
      ads: await tx.whatsappAd.count(),
    }));
    expect(messages).toBe(1);
    expect(ads).toBe(0);
  });

  it("logs the content type, and only that, of a message of a type it doesn't read", async () => {
    const connection = await aConnectedAgency(test);
    await deliver(test, {
      customerNumber: "919876500001",
      integratedNumber: connection.integratedNumber,
      uuid: `wamid.${freshPhone()}`,
      direction: "0",
      contentType: "order",
      text: "secret words",
    });
    const entry = test.logger.entries.find((line) => line.event === "whatsapp.unknown-type");
    expect(entry).toMatchObject({ level: "warn", organizationId: connection.organizationId, contentType: "order" });
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(JSON.stringify(entry)).not.toContain("9198765");
  });
});
