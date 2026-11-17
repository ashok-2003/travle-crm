// Ads that bring chats: a click-to-WhatsApp ad is noted on the chat while its first message is processed (the raw webhook is
// blanked after 7 days), and the agency links it to the package it promotes, which is what the AI agent opens the chat with.
import type { OrgTx } from "@travel-crm/db";
import type { ParsedMessage } from "@travel-crm/integrations/whatsapp";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const HEADLINE_LIMIT = 300;
const URL_LIMIT = 2000;

/** The ad's key: Meta's source id, else its headline lower-cased; null when it names neither. */
function keyOf(referral: NonNullable<ParsedMessage["referral"]>): string | null {
  const sourceId = referral.sourceId?.trim().slice(0, HEADLINE_LIMIT) ?? "";
  if (sourceId !== "") return sourceId;
  const headline = referral.headline?.trim().toLowerCase() ?? "";
  return headline === "" ? null : `headline:${headline}`.slice(0, HEADLINE_LIMIT);
}

/** Only a web link is kept: the address came from outside and is shown to staff as a link. */
const webLink = (value: string | null): string | null =>
  value !== null && /^https?:\/\//i.test(value) && value.length <= URL_LIMIT ? value : null;

/**
 * Notes the ad (one row per ad, bumping when it was last seen). The chat keeps its first ad (what the ads list counts)
 * and its latest, which is what the AI agent opens with.
 */
export async function noteAdOf(
  tx: OrgTx,
  conversationId: string,
  referral: NonNullable<ParsedMessage["referral"]>,
  now: Date,
): Promise<void> {
  // The parser cleans these; the caps are held again here so the table's CHECKs can never fail and cost the message.
  const adKey = keyOf(referral)?.slice(0, HEADLINE_LIMIT) ?? null;
  if (adKey === null) return;
  const trimmed = referral.headline?.trim().slice(0, HEADLINE_LIMIT) ?? "";
  const headline = trimmed === "" ? null : trimmed;
  const sourceUrl = webLink(referral.sourceUrl);
  await tx.whatsappAd.createMany({
    data: [{ adKey, headline, sourceUrl, firstSeenAt: now, lastSeenAt: now }],
    skipDuplicates: true,
  });
  // A late retry of an older message never moves the time back; a fresher headline or link replaces the stored one.
  await tx.whatsappAd.updateMany({
    where: { adKey, lastSeenAt: { lte: now } },
    data: { lastSeenAt: now, ...(headline === null ? {} : { headline }), ...(sourceUrl === null ? {} : { sourceUrl }) },
  });
  const ad = await tx.whatsappAd.findFirst({ where: { adKey }, select: { id: true } });
  if (ad === null) return;
  await tx.whatsappConversation.updateMany({ where: { id: conversationId, adId: null }, data: { adId: ad.id } });
  await tx.whatsappConversation.updateMany({ where: { id: conversationId }, data: { lastAdId: ad.id } });
}

/** The agency's ads, the latest first, with how many chats each brought. */
export async function adsOf(tx: OrgTx): Promise<
  {
    id: string;
    headline: string | null;
    sourceUrl: string | null;
    packageId: string | null;
    chats: number;
    lastSeenAt: Date;
  }[]
> {
  const ads = await tx.whatsappAd.findMany({
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    select: { id: true, headline: true, sourceUrl: true, packageId: true, lastSeenAt: true },
  });
  const counts = await tx.whatsappConversation.groupBy({
    by: ["adId"],
    where: { adId: { not: null } },
    _count: { _all: true },
  });
  const chats = new Map(counts.map((row) => [row.adId, row._count._all]));
  return ads.map((ad) => ({ ...ad, chats: chats.get(ad.id) ?? 0 }));
}

/** The packages an ad may promote (the agency's live ones of any kind, as linkAd accepts), by name. */
export async function adPackageChoicesOf(tx: OrgTx): Promise<{ id: string; name: string }[]> {
  return tx.quoteTemplate.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
}

/** Links an ad to one of the agency's packages (any kind), or unlinks it. */
export async function linkAd(
  tx: OrgTx,
  access: MemberAccess,
  input: { adId: string; packageId: string | null },
): Promise<void> {
  const ad = await tx.whatsappAd.findUnique({
    where: { organizationId_id: { organizationId: access.organizationId, id: input.adId } },
    select: { id: true, packageId: true },
  });
  if (ad === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (input.packageId !== null) {
    const live = await tx.quoteTemplate.findFirst({ where: { id: input.packageId }, select: { id: true } });
    if (live === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  }
  await tx.whatsappAd.update({
    where: { organizationId_id: { organizationId: access.organizationId, id: ad.id } },
    data: { packageId: input.packageId },
  });
  await recordAudit(tx, access, {
    action: "whatsapp-ad.linked",
    entityType: "whatsapp_ad",
    entityId: ad.id,
    before: { packageId: ad.packageId },
    after: { packageId: input.packageId },
  });
}

/** The package the chat's latest ad promotes, or null: what the AI agent opens with. */
export async function adPackageOf(tx: OrgTx, conversationId: string): Promise<string | null> {
  const chat = await tx.whatsappConversation.findFirst({
    where: { id: conversationId },
    select: { lastAd: { select: { packageId: true } } },
  });
  const packageId = chat?.lastAd?.packageId ?? null;
  if (packageId === null) return null;
  const live = await tx.quoteTemplate.findFirst({ where: { id: packageId }, select: { id: true } });
  return live === null ? null : packageId;
}
