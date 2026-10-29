// Isolation fixtures for the notifications module: the bell, opt-outs and push subscriptions.
import type { OrgTableFixtures } from "../org-table-fixture.js";

const someone = "0199e7a0-0000-7000-8000-00000000beef";

export const fixtures: OrgTableFixtures = {
  notification: {
    create: (tx) =>
      tx.notification.create({
        data: { recipientUserId: someone, kind: "isolation.checked", title: "Isolation", body: "Checked" },
      }),
    appendOnly: true,
    // The bell marks it read; delivery claims and marks its email and push (seven columns are granted).
    updatableColumn: "read_at",
  },
  notification_preference: {
    create: (tx) =>
      tx.notificationPreference.create({ data: { userId: someone, channel: "email", kind: "*", optedOut: true } }),
  },
  morning_push_setting: {
    create: (tx) => tx.morningPushSetting.create({ data: { userId: someone } }),
    undeletable: true,
  },
  notification_routing: {
    create: (tx) => tx.notificationRouting.create({ data: { emailUserIds: [someone] } }),
    undeletable: true,
  },
  push_subscription: {
    create: (tx) =>
      tx.pushSubscription.create({
        data: { userId: someone, endpoint: "https://push.example/isolation", p256dh: "key", auth: "secret" },
      }),
  },
};
