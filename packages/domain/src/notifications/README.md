# notifications

Telling people that something happened (spec 9.4): the in-app bell, email and web push. WhatsApp templates arrive
in build step 2.

## Public functions and values (`index.ts`)

- `notify(tx, actor, { recipientUserIds, kind, title, body, link?, channels })`: the one service every module calls,
  in its own transaction. One bell notification per person (the actor is left out: nobody is told about their own
  action), and when `channels` names `email` or `push`, one `notification.created` event per notification. Returns
  the ids.
- `deliverNotificationListener({ email, push, organizationProfile, memberContacts, appUrl })`: the worker's listener
  `notifications.deliver`. Pass identity's `organizationProfile` and `memberContacts`, the email and push adapters,
  and the web app's address.
- The bell, always the acting person's own: `listNotifications(tx, actor, { cursor?, limit? })` (newest first),
  `unreadCount(tx, actor)`, `markRead(tx, actor, { notificationIds } | { all: true })`.
- Opt-outs: `setPreference(tx, actor, { channel, kind, optedOut })`, `listPreferences(tx, actor)`,
  `isOptedOut(preferences, channel, kind)`.
- Push: `savePushSubscription(tx, actor, subscription)`, `removePushSubscription(tx, actor, { endpoint })`.
- Type `Person`: an actor with a user id. A job has no bell (`FORBIDDEN`/`NOT_A_PERSON`).

## Events

- Publishes `notification.created` (`{ notificationId, channels }`), handled by `notifications.deliver`.

## Rules worth knowing

- Kinds read `<entity>.<what happened>` (`share-link.opened`); opt-outs are per kind, or `*` for every kind, and a
  kind's own choice wins over `*`. The bell can't be turned off.
- Links are paths inside the web app (`/quotes/42`), never full URLs: a notification can't lead anyone off the app.
- Email comes from our address as "<organization> via <product>", with Reply-To the organization's contact email when
  set, and a `List-Unsubscribe` header pointing at `/settings/notifications`. Staff without email get none.
- Delivery claims a channel (`emailed_at`, `pushed_at`) before sending it, so a duplicate or overlapping delivery of
  the same event sends nothing twice. A failed send gives the claim back and throws, so the retry sends only what is
  missing. A crash between the claim and the send loses that one email or push. People who left the organization get
  nothing.
- The tRPC routers for the bell and the settings come with their screens (plan 5).
