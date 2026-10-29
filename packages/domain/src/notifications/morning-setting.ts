// A person's morning summary push (release 5): their on/off and time, read with the defaults of a person who never
// chose (on, 09:00), and saved. Only the person's own row; the worker's `today.morning-push` reads and stamps the rest.
import {
  DEFAULT_MORNING_TIME,
  morningSettingInput,
  type MorningSetting,
  type MorningSettingInput,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asOwnPerson, asPerson } from "./person.js";

export async function getMorningSetting(tx: OrgTx, actor: Actor): Promise<MorningSetting> {
  const person = asPerson(actor);
  const row = await tx.morningPushSetting.findUnique({
    where: { organizationId_userId: { organizationId: person.organizationId, userId: person.userId } },
    select: { enabled: true, localTime: true },
  });
  return { enabled: row?.enabled ?? true, time: row?.localTime ?? DEFAULT_MORNING_TIME };
}

/** Saves the acting person's choice; support impersonating them cannot (their own, like their opt-outs). */
export async function saveMorningSetting(tx: OrgTx, actor: Actor, input: MorningSettingInput): Promise<MorningSetting> {
  const person = asOwnPerson(actor);
  const { enabled, time } = parseInput(morningSettingInput, input, "INVALID_MORNING_SETTING");
  await tx.morningPushSetting.upsert({
    where: { organizationId_userId: { organizationId: person.organizationId, userId: person.userId } },
    create: { userId: person.userId, enabled, localTime: time },
    update: { enabled, localTime: time },
  });
  return { enabled, time };
}
