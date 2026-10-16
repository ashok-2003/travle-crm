// A browser's push machinery for tests, which jsdom lacks: Notification's permission and its prompt, the service
// worker's registration (or none, as in a development build) with a push manager that hands out one subscription, and
// a record of what was subscribed and unsubscribed. restore() takes it all away again.
import { vi } from "vitest";

export const THIS_PHONE = "https://fcm.googleapis.com/fcm/send/this-phone";

export interface FakePushBrowser {
  /** The subscription the push manager holds now, if any. */
  subscription(): { endpoint: string; unsubscribe: () => Promise<boolean> } | null;
  /** The options each subscribe() was given. */
  subscribedWith: PushSubscriptionOptionsInit[];
  /** How many times the permission prompt was asked. */
  asked: number;
  /** Whether anything was ever attached to the failing prompt's promise, as an unhandled rejection needs none. */
  failedPromptHandled(): boolean;
  /** How many times the browser was unsubscribed. */
  unsubscribed: number;
  restore(): void;
}

export function fakePushBrowser({
  permission = "default",
  prompt = "granted",
  registered = true,
  promptFails = false,
  subscribed = false,
  keys = true,
  unsubscribe = () => Promise.resolve(true),
}: {
  permission?: NotificationPermission;
  /** What the permission prompt answers. */
  prompt?: NotificationPermission;
  /** True when the permission prompt itself fails. */
  promptFails?: boolean;
  /** False for a page no service worker controls (a development build). */
  registered?: boolean;
  subscribed?: boolean;
  /** False for a subscription whose keys the browser can't give. */
  keys?: boolean;
  /** What the push service does when asked to forget this browser. */
  unsubscribe?: () => Promise<boolean>;
} = {}): FakePushBrowser {
  let promptHandled = false;
  let current: ReturnType<FakePushBrowser["subscription"]> = null;
  const browser: FakePushBrowser = {
    subscription: () => current,
    subscribedWith: [],
    asked: 0,
    failedPromptHandled: () => promptHandled,
    unsubscribed: 0,
    restore: () => {
      Reflect.deleteProperty(navigator, "serviceWorker");
    },
  };
  const subscription = () => ({
    endpoint: THIS_PHONE,
    expirationTime: null,
    toJSON: () => ({
      endpoint: THIS_PHONE,
      expirationTime: null,
      ...(keys ? { keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } } : {}),
    }),
    unsubscribe: async () => {
      browser.unsubscribed += 1;
      const answer = await unsubscribe();
      current = null;
      return answer;
    },
  });
  if (subscribed) current = subscription();
  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(current),
      subscribe: (options: PushSubscriptionOptionsInit) => {
        browser.subscribedWith.push(options);
        current = subscription();
        return Promise.resolve(current);
      },
    },
  };
  const notification = {
    permission,
    requestPermission: () => {
      browser.asked += 1;
      if (promptFails) {
        const failed = Promise.reject(new Error("no prompt"));
        const attach = failed.then.bind(failed);
        // catch() goes through then(), so this sees anything that handles the rejection.
        failed.then = ((...handlers: Parameters<typeof attach>) => {
          promptHandled = true;
          return attach(...handlers);
        }) as typeof failed.then;
        return failed;
      }
      notification.permission = prompt;
      return Promise.resolve(prompt);
    },
  };
  vi.stubGlobal("Notification", notification);
  // Only its presence matters: the app reaches the push manager through the registration.
  vi.stubGlobal("PushManager", { prototype: {} });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: () => Promise.resolve(registered ? registration : undefined),
      ready: Promise.resolve(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  return browser;
}
