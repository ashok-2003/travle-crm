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
- Delivery claims a channel (`email_claimed_at`, `push_claimed_at`) with a 5-minute lease before sending it, and
  records `emailed_at` / `pushed_at` only once a send worked. Overlapping or repeated runs of one event send once; a
  run that lost the claim asks to be retried until the other run has recorded its send or its lease has expired. A
  failed send gives its claim back. Email and push are independent, and each browser is tried on its own: the push is
  done when at least one browser got it. Failures that can never succeed (bad content, an oversized push, a 5xx from
  the mail server) are logged with ids only and not retried. People who left the organization get nothing.
- A listener that calls `notify()` passes `sourceEventId` (the event's id) so a repeat adds nothing, and
  `excludeUserIds` to leave out the person who acted. A request-time caller is left out automatically.
- `setPreference` and `markRead` are refused to an impersonating actor (`FORBIDDEN`/`IMPERSONATING`): consent and
  reading are the person's own.
- The tRPC routers for the bell and the settings come with their screens (plan 5).
