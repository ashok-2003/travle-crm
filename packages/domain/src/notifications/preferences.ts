// Each person's choices (spec 9.4: DPDP and WhatsApp rules): email or push, for one kind or every kind ("*"). Email
// starts off and push on (the owner, 2026-11-05: optedOutByDefault).
import {
  notificationPreferenceInput,
  optedOutByDefault,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationPreferenceInput,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asOwnPerson, asPerson } from "./person.js";

/** Turns email or push off, or back on, for the acting person. */
export async function setPreference(
  tx: OrgTx,
  actor: Actor,
  input: NotificationPreferenceInput,
): Promise<NotificationPreference> {
  const person = asOwnPerson(actor);
  const { channel, kind, optedOut } = parseInput(notificationPreferenceInput, input, "INVALID_PREFERENCE");
  const saved = await tx.notificationPreference.upsert({
    where: {
      organizationId_userId_channel_kind: {
        organizationId: person.organizationId,
        userId: person.userId,
        channel,
        kind,
      },
    },
    create: { userId: person.userId, channel, kind, optedOut },
    update: { optedOut },
  });
  return { channel, kind: saved.kind, optedOut: saved.optedOut };
}

/** The acting person's choices, by channel then kind ("*" first). */
export async function listPreferences(tx: OrgTx, actor: Actor): Promise<NotificationPreference[]> {
  const person = asPerson(actor);
  const rows = await tx.notificationPreference.findMany({
    where: { userId: person.userId },
    orderBy: [{ channel: "asc" }, { kind: "asc" }],
  });
  return rows.map((row) => ({ channel: row.channel as NotificationChannel, kind: row.kind, optedOut: row.optedOut }));
}

/**
 * True when the person turned this channel off for this kind, or for every kind without a choice for this one, or made
 * no choice at all on a channel that starts off (email).
 */
export function isOptedOut(
  preferences: readonly { channel: string; kind: string; optedOut: boolean }[],
  channel: NotificationChannel,
  kind: string,
): boolean {
  const forKind = preferences.find((preference) => preference.channel === channel && preference.kind === kind);
  if (forKind) return forKind.optedOut;
  const forEveryKind = preferences.find((preference) => preference.channel === channel && preference.kind === "*");
  return forEveryKind?.optedOut ?? optedOutByDefault[channel];
}
