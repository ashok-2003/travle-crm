// Ads that bring chats: noted on the chat while the first message is processed, one row per ad however many chats it brings,
// linked by the agency to one of its own packages, which the chat then answers with.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { softDeleted } from "@travel-crm/db";
import { adPackageChoicesOf, adPackageOf, adsOf, linkAd } from "../../src/inbox/index.js";
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

  it("answers with the package of the chat's latest ad, while the first ad stays the chat's ad", async () => {
    const connection = await aConnectedAgency(test);
    const phone = await write(connection, { referral });
    const first = await chatOf(connection.organizationId, phone);
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Another one" }),
      referral: { source_id: "999", headline: "Spiti ad" },
    });
    const second = await chatOf(connection.organizationId, phone);
    expect(second.adId).toBe(first.adId);
    expect(second.lastAdId).not.toBe(first.adId);
    const goa = await aPackage(connection.organizationId, "Goa");
    const spiti = await aPackage(connection.organizationId, "Spiti");
    const member = memberOf(connection.organizationId, "org-admin");
    await test.db.forOrg(connection.organizationId, async (tx) => {
      await linkAd(tx, member, { adId: first.adId ?? "", packageId: goa });
      await linkAd(tx, member, { adId: second.lastAdId ?? "", packageId: spiti });
    });
    expect(await test.db.forOrg(connection.organizationId, (tx) => adPackageOf(tx, first.id))).toBe(spiti);
    // The ads list still counts the chat under its first ad.
    const counts = await test.db.forOrg(connection.organizationId, (tx) => adsOf(tx));
    expect(counts.find((ad) => ad.id === first.adId)?.chats).toBe(1);
  });

  it("answers null when the linked package has been deleted", async () => {
    const connection = await aConnectedAgency(test);
    const phone = await write(connection, { referral });
    const chat = await chatOf(connection.organizationId, phone);
    const packageId = await aPackage(connection.organizationId);
    const member = memberOf(connection.organizationId, "org-admin");
    await test.db.forOrg(connection.organizationId, (tx) => linkAd(tx, member, { adId: chat.adId ?? "", packageId }));
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.quoteTemplate.update({ where: { id: packageId }, data: softDeleted(member.userId) }),
    );
    expect(await test.db.forOrg(connection.organizationId, (tx) => adPackageOf(tx, chat.id))).toBeNull();
  });

  it("keeps only a web link as the ad's source URL", async () => {
    const connection = await aConnectedAgency(test);
    await write(connection, { referral: { source_id: "js-1", headline: "x", source_url: "javascript:alert(1)" } });
    const [ad] = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappAd.findMany());
    expect(ad?.sourceUrl).toBeNull();
  });

  it("keys a 400-character source id to its first 300 without losing the message", async () => {
    const connection = await aConnectedAgency(test);
    const phone = await write(connection, { referral: { source_id: "s".repeat(400), headline: "Long" } });
    const [ad] = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappAd.findMany());
    expect(ad?.adKey).toBe("s".repeat(300));
    expect((await chatOf(connection.organizationId, phone)).adId).toBe(ad?.id);
  });

  it("offers the agency's live packages by name, not a deleted one or another agency's", async () => {
    const connection = await aConnectedAgency(test);
    const other = await aConnectedAgency(test);
    const spiti = await aPackage(connection.organizationId, "Spiti");
    const goa = await aPackage(connection.organizationId, "Goa");
    const gone = await aPackage(connection.organizationId, "Old trip");
    await aPackage(other.organizationId, "Elsewhere");
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.quoteTemplate.update({
        where: { id: gone },
        data: softDeleted(memberOf(connection.organizationId, "org-admin").userId),
      }),
    );
    const choices = await test.db.forOrg(connection.organizationId, (tx) => adPackageChoicesOf(tx));
    expect(choices).toEqual([
      { id: goa, name: "Goa" },
      { id: spiti, name: "Spiti" },
    ]);
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
