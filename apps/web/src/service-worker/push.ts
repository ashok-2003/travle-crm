// What the service worker does with a push (spec 9.4), decided from facts alone so it can be tested without a worker:
// the notification it shows, from the payload the api's delivery sends ({ title, body, url }, the domain's
// push-payload.ts), with the app's own words for one it can't read, since a browser must show something for every
// push; and where a tap leads: the push's path in the app, else home, so a push never opens another site.
import notificationWords from "../i18n/messages/en-IN/notifications.json";
import { isAppPath, routes } from "../lib/routes";

/** The app's icon, shown beside the notification's text. */
const ICON = "/icons/icon-192.png";

export interface PushNotification {
  title: string;
  options: { body: string; icon: string; data: { path: string } };
}

function fieldsOf(payload: string | null): Record<string, unknown> {
  if (payload === null) return {};
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const textOf = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/** The notification for a push, from its payload's text (null for a push without one). */
export function notificationFor(payload: string | null): PushNotification {
  const fields = fieldsOf(payload);
  const title = textOf(fields.title);
  if (title === null) {
    const { fallbackTitle, fallbackBody } = notificationWords.push;
    return { title: fallbackTitle, options: { body: fallbackBody, icon: ICON, data: { path: routes.home } } };
  }
  const url = textOf(fields.url);
  const path = url !== null && isAppPath(url) ? url : routes.home;
  return { title, options: { body: textOf(fields.body) ?? "", icon: ICON, data: { path } } };
}

/** The address a tap on a notification opens: its path on the app's own origin, or home. */
export function tapTarget(data: unknown, origin: string): string {
  const path = data !== null && typeof data === "object" ? (data as { path?: unknown }).path : undefined;
  return new URL(typeof path === "string" && isAppPath(path) ? path : routes.home, origin).href;
}

interface AppWindow {
  url: string;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<{ focus(): Promise<unknown> } | null>;
}

/** The worker's clients, as far as opening a notification's page needs them. */
export interface AppWindows {
  matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly AppWindow[]>;
  openWindow(url: string): Promise<unknown>;
}

/** A window of the app already on the page comes forward; else one of the app's windows goes there; else one opens. */
export async function openFromNotification(clients: AppWindows, url: string): Promise<void> {
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const there = windows.find((client) => client.url === url);
  if (there) {
    await there.focus();
    return;
  }
  const [other] = windows;
  // Only a window the worker controls can be moved; any other stays as it is, and a new one opens.
  const moved = other ? await other.navigate(url).catch(() => null) : null;
  if (moved) await moved.focus();
  else await clients.openWindow(url);
}
