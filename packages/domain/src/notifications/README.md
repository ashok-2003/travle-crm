# notifications

Telling people that something happened (spec 9.4): the in-app bell, email and web push. WhatsApp templates arrive
in build step 2.

## Public functions and values (`index.ts`)

- `notify(tx, actor, { recipientUserIds, excludeUserIds?, sourceEventId?, kind, title, body, link?, channels })`: the
  one service every module calls, in its own transaction. One bell notification per person (the actor and anyone in
  `excludeUserIds` are left out: nobody is told about their own action), and when `channels` names `email` or `push`,
  one `notification.created` event per notification. A listener passes its event's id as `sourceEventId`, so running
  again adds nothing. Returns the ids of the notifications this call created.
- `deliverNotificationListener({ email, push, organizationProfile, memberContacts, appUrl, log })`: the worker's
  listener `notifications.deliver`. Pass identity's `organizationProfile` and `memberContacts`, the email and push
  adapters, the web app's address, and the worker's log (ids and codes only).
- The bell, always the acting person's own: `listNotifications(tx, actor, { cursor?, limit? })` (newest first),
  `unreadCount(tx, actor)`, `markRead(tx, actor, { notificationIds } | { all: true })`.
- Opt-outs: `setPreference(tx, actor, { channel, kind, optedOut })`, `listPreferences(tx, actor)`,
  `isOptedOut(preferences, channel, kind)`.
- Push: `savePushSubscription(tx, actor, subscription)`, `removePushSubscription(tx, actor, { endpoint })`.
- `forgetPushSubscriptionsListener`: the worker's listener `notifications.forget-push-subscriptions`. When identity
  removes a member (`staff.removed`), it deletes all their push subscriptions in the event's organization.
- Type `Person`: an actor with a user id. A job has no bell (`FORBIDDEN`/`NOT_A_PERSON`).

- `forgetRecipient(tx, { organizationId, userId })`: an erasure's part (spec 5): the person's notifications, opt-outs
  and push subscriptions, deleted by the platform role.
- `forgetRecordNotifications(tx, { organizationId, recordId, sourceEventIds })`: a record's erasure (spec 5, ADR
  0022): deletes the notifications about the record, those whose link names its id and those the given events caused
  (a share link's opens: their titles quote its label), by the platform role. Returns how many went. Emails and pushes
  already sent stay sent.

## Events

- Publishes `notification.created` (`{ notificationId, channels }`), handled by `notifications.deliver`.
- Listens to `staff.removed` (`notifications.forget-push-subscriptions`): deletes the removed person's push
  subscriptions. They go a moment after the removal, not with it, which is harmless: delivery already skips people who
  have left. A rerun deletes nothing.

## Rules worth knowing

- Kinds read `<entity>.<what happened>` (`share-link.opened`); opt-outs are per kind, or `*` for every kind, and a
  kind's own choice wins over `*`. The bell can't be turned off.
- Links are paths inside the web app (`/quotes/42`), never full URLs: a notification can't lead anyone off the app.
- A notification about a record links to it by its id (`/travellers/<id>`), or names the event about it as
  `sourceEventId`: that is how the record's erasure finds it. One that quotes a person's data with neither is missed.
- Email comes from our address as "<organization> via <product>", with Reply-To the organization's contact email when
  set, and a `List-Unsubscribe` header pointing at `/settings/notifications`. Staff without email get none.
- Delivery claims a channel (`email_claimed_at`, `push_claimed_at`) with a 5-minute lease before sending it, and
  records `emailed_at` / `pushed_at` only once a send worked. Overlapping or repeated runs of one event send once; a
  run that lost the claim asks to be retried until the other run has recorded its send or its lease has expired. A
  failed send gives its claim back. Email and push are independent, and each browser is tried on its own: the push is
  done when at least one browser got it. Failures that can never succeed (bad content, an oversized push, a mail server
  refusing this message with a 5xx `EENVELOPE`/`EMESSAGE`) are recorded (`email_failed_at`, `push_failed_at`), logged with
  ids and codes only, and never tried or logged again; a refused login or greeting (EAUTH 535, 554) is retried. A push
  with no browser left to send to is recorded as failed, not sent. The listener's `log` is required: the worker passes
  its logger. People who left the organization get nothing.
- A listener that calls `notify()` passes `sourceEventId` (the event's id) so a repeat adds nothing, and
  `excludeUserIds` to leave out the person who acted. A request-time caller is left out automatically.
- `setPreference` and `markRead` are refused to an impersonating actor (`FORBIDDEN`/`IMPERSONATING`): consent and
  reading are the person's own.
- The tRPC routers for the bell and the settings come with their screens (plan 5).
