// Keeps Chrome's install prompt for the install bar. Chrome fires `beforeinstallprompt` early, often before React has
// mounted, so this small inline script (first in the body) saves the event on `window` and says so; the bar reads it.
// React writes a script's text as it is, so it runs as the page loads (test/no-inner-html allows this one script and
// checks its text is the constant below).
// Nothing is stored and nothing is sent: the event lives in memory until the page closes.
export const installPromptScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.deferredInstallPrompt=e;window.dispatchEvent(new Event("install-prompt-saved"))});window.addEventListener("appinstalled",function(){window.deferredInstallPrompt=null})`;

export function InstallPromptCapture() {
  return <script>{installPromptScript}</script>;
}
