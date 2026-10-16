// subscription.get's answer for the screens' write actions (useWriteAccess): an active organization, or one in a
// lifecycle state that refuses changes.
import type { Answer } from "../support/api-stub";

export function subscriptionAnswer(access: "full" | "read_only" = "full"): Answer {
  return {
    data: {
      status: access === "full" ? "active" : "read_only",
      access,
      planName: "Growth",
      modules: [],
      trialEndsOn: null,
      paidThrough: null,
      nextChangeOn: null,
      limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
    },
  };
}
