# 0026: The agency's remaining screens

Date: 2026-10-16 · Status: accepted · Implements spec sections 7.1, 7.3, 9.2-9.5 and 11 in the organization app

## Decision

- **The subscription's state, as check 2 decides it.** `subscription.get` drives a banner in the trial's last week,
  while payment is due ("Read-only from 22 Oct") and while read-only, shown to every member whatever their role (the
  owner's ruling: staff should know why the app may soon stop, not only those who can pay); suspended, cancelled or
  without a subscription, every screen but the person's own account and their notification choices is replaced by one
  saying what happened and how to reach support. The choices stay open in every state because every notification email's
  unsubscribe link opens them, and their api works whatever the organization has paid. The Owner of a suspended
  organization still reaches Staff, Documents and the business files, where every call is an export or a revocation.
  Requiring two-factor is a revocation too, but has no screen while suspended: the settings screen stays shut. The
  navigation hides an item whose plan module the organization lacks. A change's button asks `useWriteAccess(kind)`,
  which mirrors `assertLifecycleAllows`, and, refused, is disabled with the reason's sentence as its description. Taking
  access away, and finding whom or what to cut off (removing staff and the list to choose them from, a new temporary
  password, requiring two-factor, a document's share links and turning one off), is the `revoke` kind; taking the papers
  away (a file's or a PDF's download link, and the lists of the papers and the issued documents) is the `export` kind.
  Both stay open while read-only, and for the Owner while suspended.
- **Every refusal reason has its sentence.** `errors.json` holds one for every reason a `DomainError` can carry in the
  domain, the api and the api server, and may hold one for a code Better Auth's side doors refuse with
  (`TARGET_HAS_PENDING_STEP`); a test reads the sources and fails on a reason without a sentence, or a sentence
  without a reason.
- **Files go straight to storage.** The browser checks a file by the contract's rules, PUTs it to the presigned URL
  with the signed headers (`uploadFile`, over XMLHttpRequest for its progress; a 412 on a retried PUT means the first
  arrived), then confirms it. The Content-Security-Policy allows `STORAGE_ORIGIN` in `connect-src` and `img-src`,
  fixed when the app is built; the bucket needs a CORS rule for the app's origin. `AttachmentsPanel` is the files UI
  any record's screen reuses; the Foundation's `attachments` router serves the organization's own papers (record type
  `organization`) with `settings:manage`. A download link, the papers' or an issued document's, is a mutation of the
  export kind on a session read from the database, so it is never cached. A record's files are listed by when they
  arrived.
- **The logo** is an attachment of record type `organization_logo` whose record is the organization: PNG or JPEG (what
  React-PDF draws), at most 1 MB, 4096 pixels a side and 16 megapixels; the one that arrived last is the logo
  (`organization.logo.*`). The confirm step reads the stored file's headers (a PNG's chunks as png-js reads them,
  JPEG's frame header): bytes that aren't the image they say, an interlaced PNG, or one whose pixel data inflates to
  more than its header's rows or has a row whose filter type png-js doesn't know, are `UPLOAD_DOES_NOT_MATCH`, and
  more pixels `LOGO_TOO_LARGE`. A 1 MB file can claim, or inflate to, gigabytes of pixels, which pdfkit would allocate
  in the worker every organization shares; and png-js throws at a bad filter type, or misreads a narrow interlaced
  image, inside a zlib callback nothing can catch, which would stop that worker on every retry. A JPEG is drawn from
  only the segments that draw it: React-PDF reads every JPEG marker with jay-peg, whose EXIF reader a hundred bytes
  can take out of memory, so no metadata (EXIF, XMP, ICC, comments) reaches it, and a JPEG whose segments it would
  read otherwise is `UPLOAD_DOES_NOT_MATCH`. The PDF shows the logo as stored, without EXIF's rotation. An issued
  document freezes its attachment id in its branding, and the worker reads the bytes through the files module and
  draws them; a logo it can't read, or past the cap (one stored before it), is left out, and the document still
  renders.
- **A sample quotation** (`documents.issueSample`, numbered `SMPL-<year>-<n>`, kept as every issued document is)
  previews the branding on a real PDF, and `/settings/documents` lists the issued documents with their PDFs. It is the
  Foundation's one shareable record: staff make, list and turn off share links there (`shareLinks.*`), the whole link
  shown once; making and turning one off are recorded in the audit log by ids, never the label. Making a link reads
  the session from the database, and a document whose PDF can never be made isn't shared. No invoice prefix may be
  `SMPL` or `DOC` (the contracts' `reservedDocumentPrefixes`, and a CHECK), so samples keep a number series of their
  own; they aren't counted as the platform's usage, and an organization makes at most 50 in any 24 hours.
- **The bell** (`notifications.*`, any member): the unread count in the People violet, the list a page at a time,
  marking read, each link followed only when it is an app path; `/account/notifications` holds the email and push
  choices, the page every notification email's unsubscribe link opens, in every state. **Push** is turned on per device:
  the browser takes the VAPID public key from `notifications.push.publicKey` (one build for every environment), the
  service worker shows a push and opens its page on a tap. Every sign-out and every sign-in drops the browser's
  subscription on the device, offline too, which stops delivery at once; signing out also asks the api to delete its
  row, and reports a failure. A subscription row is per organization, so the row another organization holds for a shared
  browser goes when the push service answers 404 or 410 for its old endpoint (ADR 0014's rule). Support impersonating a
  member can't subscribe a browser.
- **The audit log** (`/settings/audit`, `audit:view`, with its own navigation item): newest first, one record's history
  on request; the api names each change's actor from the organization's active members (support impersonating as
  "Support, as <member>", platform admins as "Platform team", the system as "Automatic") and keeps user ids to itself.
- **The business profile and the setup checklist** (`/settings/profile`, `/setup`): the Owner's home shows the
  checklist until every step is done; the form checks with the api's own schema, a GSTIN of another state included.

## Context

Plans 3 and 4 built these services and their domain functions and left the routers and screens to plan 5: files
(ADR 0011), PDFs (0012), share links (0013), notifications (0014), the audit log (0015), the lifecycle (0021) and the
business profile (0024). Spec 7.1 lands the Owner on a setup checklist; spec 9.3 puts the organization's logo on its
documents.

## Consequences

- A new `DomainError` reason needs its sentence in `errors.json`, a new audit action its sentence in `audit.json`, and
  a new notification kind its entry in `src/notifications/preferences/kinds.ts`: each has a test that fails without it.
- A web image is built for one storage origin. Path-style URLs on one regional endpoint (`S3_FORCE_PATH_STYLE`) give
  staging and production one origin; otherwise it is a build per environment, or a per-request header later.
- Samples stay among the issued documents for good, numbered apart from real ones; a module that numbers its
  documents with a prefix of its own adds it to `reservedDocumentPrefixes` and to the database's CHECK.
- Push is checked as far as Chromium goes without a push service: a real delivery (FCM, Mozilla, Apple) and an
  iPhone Home Screen app are tried on devices before launch.
