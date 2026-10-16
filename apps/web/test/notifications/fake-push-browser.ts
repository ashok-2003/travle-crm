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
  /** How many times the browser was unsubscribed. */
  unsubscribed: number;
  restore(): void;
}

export function fakePushBrowser({
  permission = "default",
  prompt = "granted",
  registered = true,
  subscribed = false,
  keys = true,
  unsubscribe = () => Promise.resolve(true),
}: {
  permission?: NotificationPermission;
  /** What the permission prompt answers. */
  prompt?: NotificationPermission;
  /** False for a page no service worker controls (a development build). */
  registered?: boolean;
  subscribed?: boolean;
  /** False for a subscription whose keys the browser can't give. */
  keys?: boolean;
  /** What the push service does when asked to forget this browser. */
  unsubscribe?: () => Promise<boolean>;
} = {}): FakePushBrowser {
  let current: ReturnType<FakePushBrowser["subscription"]> = null;
  const browser: FakePushBrowser = {
    subscription: () => current,
    subscribedWith: [],
    asked: 0,
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
    requestPermission: vi.fn(() => {
      browser.asked += 1;
      notification.permission = prompt;
      return Promise.resolve(prompt);
    }),
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
