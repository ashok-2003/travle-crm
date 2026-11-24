# The installed app: an icon that updates, a better boot screen, and a "works best in the app" banner

Owner-led, 2026-11-25. Approved by the owner ("yes") after the discussion below; item 3 updated with the owner the same day
(1 week, and remembering who uses the installed app, which covers Safari).

## Why

The owner's phone (Android) still shows the first Veeper logo (a green V with an arrow), replaced on 2026-11-01 by the six
petals: Chrome on Android (144 and later) only notices a new icon when its file address changes, and ours kept
`/icons/icon-512.png`. The boot screen looks bad (Android draws it from the manifest: the cream background with a black
icon tile in the middle; an iPhone shows a blank screen, because we give it no startup images). And agents who use the site
in a phone's browser should be nudged to the installed app, which works better (push, full screen).

## Decided

1. **The icon refreshes by itself on Android.** The six-petal mark stays (owner: "six petal is good"). The icon files get
   new names with a version (`icon-192-v2.png`, `icon-512-v2.png`, `icon-maskable-512-v2.png`, `apple-touch-icon-v2.png`),
   so Chrome sees the manifest change and offers "Update app" the next time the installed app opens. Everything that names
   an icon (the manifest, the page head, the service worker's push icon) uses the new names. An iPhone can't refresh a
   home-screen icon: there it takes removing the app and adding it again.
2. **The boot screen.** The manifest's `background_color` becomes the brand's ink (#1a1a1a), so Android's splash is black
   with the white petals blending into it; `theme_color` stays the canvas (the top bar matches the app). iPhones get
   `apple-touch-startup-image` screens, black with the petals centred, for the common iPhone sizes (portrait), rendered
   from the brand's logo at build time like the other icons.
3. **The banner** (owner's sketch: a thin bar at the top with ×):
   - phones only, in the browser only: never inside the installed app (`display-mode: standalone`, or iOS's
     `navigator.standalone`), never on a computer, never on the public pages (`/f`, `/embed`, `/a`, `/p`, `/vip`, the
     sign-in pages) or in the console;
   - Android, not installed (Chrome offered `beforeinstallprompt`): "Veeper works best as an app" with **Install**, which
     opens Chrome's install sheet; once installed, the bar goes;
   - Android, already installed (`navigator.getInstalledRelatedApps()` finds it, with the manifest's
     `related_applications` naming the web app itself): "Works best in the app: open Veeper from your home screen", no
     button (no website can open the installed app);
   - iPhone or iPad Safari: "Works best in the app: tap Share, then Add to Home Screen" (Safari itself can't tell us
     whether it's installed);
   - **remembering who uses the installed app** (owner: "is there some way we can know ... that's the way we can handle
     Safari too"): each time a signed-in person opens the installed app (standalone), the server notes it for them and
     that kind of phone (iPhone/iPad or Android; at most once a day). In the browser on that kind of phone, if they used
     the installed app in the last 30 days (the controller's call), the bar says "Works best in the app: open Veeper from
     your home screen" instead of the Install or Add to Home Screen line. It's per person and phone type, not per exact
     phone; it holds a timestamp and the phone type only;
   - anything else (an unknown browser on a phone): no bar;
   - × hides it in that browser for 1 week (owner), kept in localStorage (a per-browser convenience);
   - a 44px-tall bar, the brand's tokens, registry components, every word in the messages files.

## Not in this change

A new logo; Android's own "Open in app" handling; shortcuts or screenshots in the manifest.

## Done when

- Brand: tests that the renderer writes the versioned file names and the startup images, and that `pwaIcons` names them;
  the web app's manifest test (background ink, theme canvas, related_applications, the new icon names); the push icon's
  test.
- Banner: unit tests for each state (installed app: none; desktop: none; Android installable: Install calls the saved
  prompt; Android installed: the home-screen line; iPhone: the Share line; dismissed: none for a week, back after; the server's memory: an installed-app visit is recorded once a day, and the browser on that phone type then shows the home-screen line); the
  public pages and the console never show it.
- A shot of the bar at 390px in each state, and of the Android splash's colours (the manifest) checked by eye.
