// Registers the service worker (src/service-worker), for the whole app. Only production builds do: a worker
// keeping a development build's files would serve stale code, so development also removes a worker that a production
// build (`pnpm start`, on the same address as `pnpm dev`) left behind. Registration failing leaves the app working,
// online.

interface NavigatorWithWorkers {
  serviceWorker?: {
    register: (url: string, options: RegistrationOptions) => Promise<unknown>;
    getRegistrations: () => Promise<readonly { unregister: () => Promise<boolean> }[]>;
  };
}

/** Returns whether a worker was registered. */
export async function registerServiceWorker(
  navigator: NavigatorWithWorkers,
  nodeEnvironment: string,
): Promise<boolean> {
  const workers = navigator.serviceWorker;
  if (!workers) return false;
  if (nodeEnvironment !== "production") {
    // It still controls this page; the next load is the development build's own.
    const registrations = await workers.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    return false;
  }
  try {
    // updateViaCache "none": the browser always asks the server for a newer sw.js, never its HTTP cache.
    await workers.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return true;
  } catch (error) {
    // Once per page load. The browser's reason names only the app's address and /sw.js, never anyone's data.
    console.warn("The service worker wasn't registered, so the app won't open offline:", reason(error));
    return false;
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
