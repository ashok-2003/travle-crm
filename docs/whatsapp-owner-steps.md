# WhatsApp through MSG91: the owner's steps

What only the owner can do (accounts, money, Meta's approvals, the privacy policy), in order. It is the owner's checklist of
`docs/superpowers/specs/2026-10-23-whatsapp-design.md` section 13, with the settings as `docs/deploy-checklist.md` has them.

Settings, all three or none, given to the api, the worker and the console:

| Variable              | What it is                                                     | Secret |
| --------------------- | -------------------------------------------------------------- | ------ |
| `MSG91_AUTHKEY`       | the MSG91 account's API key (Settings, API keys)               | yes    |
| `MSG91_WEBHOOK_TOKEN` | at least 32 random characters; the path segment of the webhook | yes    |
| `MSG91_WEBHOOK_KEY`   | at least 32 random characters; the value of `x-travel-crm-key` | yes    |

To rotate the token and key, change them in the host and in MSG91's panel within minutes of each other, when it is quiet.

**The owner's steps, in order.** "Pilot" = before the owner tests on the pilot. "Real" = before real agencies.

1. **(Pilot) Sign up for MSG91 and complete KYC** with the registered business's name, GST and PAN, and a business email on
   the business's domain. Choose the WhatsApp plan (Titan, Rs 500 + 18% GST a month after two free months; **ask MSG91
   whether this is per number or per account** and whether there is a reseller rate: S10).
2. **(Pilot) Recharge the wallet** (the amount is yours to choose; Meta's charges for utility and marketing templates come out of
   it, customer-started chats are free).
3. **(Pilot) Add a test number.** Either a spare SIM that has never been on WhatsApp, or a number on the WhatsApp Business App
   with 30+ days of chats (for coexistence). In MSG91's panel: WhatsApp, **Add Number**; sign in to Facebook when asked,
   pick the business portfolio that will own the WhatsApp Business Account (use a **new** portfolio for the test, not
   "agencyOS", until you have read the lock-in note, friction 6), choose the display name, approve the code that arrives by SMS
   or call. For coexistence choose "connect an existing WhatsApp Business App account", scan the QR with the phone, and say
   whether to share history.
4. **(Pilot) Display name approval.** Meta reviews the display name; it can take a day or more. Use the business's real name.
5. **(Pilot) Send us the secrets plan:** I generate `MSG91_WEBHOOK_TOKEN` and `MSG91_WEBHOOK_KEY` (`openssl rand -base64 32`
   each) and `MSG91_AUTHKEY` comes from MSG91 (Settings, API keys). You put all three in Render for `travel-crm-api`,
   `travel-crm-worker` and the console service, as secrets, and redeploy; the start-up line says WhatsApp is on.
6. **(Pilot) Paste the webhook in MSG91's panel:** WhatsApp, Webhook (New). URL `https://<api>/webhooks/msg91-whatsapp/<token>`
   (the console shows the exact line with **Show secret**), method POST, JSON, and one custom header `x-travel-crm-key` with the
   key. Turn on inbound messages **and** delivery reports. Save. Do this once for the account. If the webhook ever says
   "paused", fix the cause and re-enable it here.
7. **(Pilot) Record the number in the console** (Organizations, the pilot agency, WhatsApp, Connect a number); send a message to
   it from a phone; wait for "Webhook received"; Mark connected. Give the pilot agency the `inbox` module and a WhatsApp-numbers
   limit of 1 on its plan first.
8. **(Pilot) Test as the owner:** message the number, check the lead and the chat, reply, send a photo, wait a day, send a
   template. Tell me what S2 shows for messages sent from the phone.
9. **(Real) Per agency: collect** the agency's WhatsApp number, whether it is on the Business App today, the person who will log
   in to Facebook during Add Number (that person must be an admin of the agency's business portfolio, or we use ours,
   friction 6), the display name they want, and their written agreement that we process their customers' chats (the privacy
   policy and terms, below).
10. **(Real) Per agency in MSG91's panel:** Add Number (step 3), record it in the console (step 7), and take the first
    screenshot of the quality rating.
11. **(Real) Meta's limit:** until the agency's business portfolio is verified, it can start conversations with at most 250
    different people per day. Ask the agency to verify its business in Meta Business Settings (days to weeks, their documents) if
    they plan outbound templates at volume. Replies and customer-started chats are not limited by this.
12. **(Real) Privacy policy and terms** (Ayush's drafts are parked for the landing-page agent): they must say that WhatsApp messages
    are processed by MSG91 (hosted in the United States or Germany), Jio Haptik and Meta; that the agency owns its customers'
    chats; what happens when an agency leaves (chats are exported with their data; the number stays with the agency's
    WhatsApp Business Account but may need re-onboarding elsewhere); and how a person asks for deletion. Have someone who knows
    India's DPDP Act read them. The agency must also tell its customers it uses WhatsApp for business (Meta's rule on opt-in).
13. **(Real) Ask MSG91 in writing** the open items in the research file (S3, S9, S10 and whether a WABA made through MSG91 can leave
    without a new one) before the first paying agency.
14. **(Real, later) Move to Meta directly** when you decide to (the research file's recommendation A): a second adapter behind the
    same port; agencies' WABAs may need re-onboarding.
