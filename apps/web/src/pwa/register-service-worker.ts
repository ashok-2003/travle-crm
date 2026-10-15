// Registers the service worker (src/service-worker), for the whole app. Only production builds do: a worker
// keeping a development build's files would serve stale code. Registration failing leaves the app working, online.

interface NavigatorWithWorkers {
  serviceWorker?: { register: (url: string, options: RegistrationOptions) => Promise<unknown> };
}

/** Returns whether a worker was registered. */
export async function registerServiceWorker(
  navigator: NavigatorWithWorkers,
  nodeEnvironment: string,
): Promise<boolean> {
  if (nodeEnvironment !== "production" || !navigator.serviceWorker) return false;
  try {
    // updateViaCache "none": the browser always asks the server for a newer sw.js, never its HTTP cache.
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return true;
  } catch {
    return false;
  }
}
