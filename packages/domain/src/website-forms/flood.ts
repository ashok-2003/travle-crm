// A flood is told once (W40, F16): when the agency's limit refuses submissions, the Owner gets one notice an hour, however
// many are refused. The notice's source id is made from the form and the UTC hour, so a repeat in the hour adds nothing.
import { createHash } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

const HOUR_MS = 3_600_000;

/** A stable UUID for "form-busy:<form>:<hour>": the notification table keys one notice per source id and person. */
function busySourceId(formId: string, now: Date): string {
  const hour = String(Math.floor(now.getTime() / HOUR_MS));
  const hex = createHash("sha256").update(`form-busy:${formId}:${hour}`).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function noteFlood(
  tx: OrgTx,
  actor: Actor,
  input: { formId: string; ownerUserId: string; now: Date },
): Promise<void> {
  await notify(tx, actor, {
    recipientUserIds: [input.ownerUserId],
    sourceEventId: busySourceId(input.formId, input.now),
    kind: "form.busy",
    title: "Your website form is busy",
    body: "Your website form is getting more enquiries than usual, so we have slowed it. Check the Stopped count.",
    link: "/settings/lead-sources/website-form",
    channels: ["email", "push"],
  });
}
