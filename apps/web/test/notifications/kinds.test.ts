// @vitest-environment node
// The preferences screen shows what delivery will do: for every channel, kind and set of choices, whether a
// notification reaches the person is the opposite of the domain's own isOptedOut (tests may import the domain; only
// src is kept to the api's types). It lists every kind a module sends, each with its words.
import { readdir, readFile } from "node:fs/promises";
import type { NotificationChannel, NotificationPreference } from "@travel-crm/contracts/notifications";
import { isOptedOut } from "@travel-crm/domain/notifications";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { EVERY_KIND, notificationKinds, reaches } from "@/notifications/preferences/kinds";

const KIND = "share-link.opened";
const channels: NotificationChannel[] = ["email", "push"];

/** Every combination of no choice, in, or out, for everything and for the kind, on each channel. */
function everyChoiceSet(): NotificationPreference[][] {
  const options = [undefined, false, true];
  const sets: NotificationPreference[][] = [];
  for (const channel of channels) {
    for (const forEverything of options) {
      for (const forKind of options) {
        sets.push([
          ...(forEverything === undefined ? [] : [{ channel, kind: EVERY_KIND, optedOut: forEverything }]),
          ...(forKind === undefined ? [] : [{ channel, kind: KIND, optedOut: forKind }]),
        ]);
      }
    }
  }
  return sets;
}

describe("reaches", () => {
  it("agrees with delivery for every channel, kind and set of choices", () => {
    for (const choices of everyChoiceSet()) {
      for (const channel of channels) {
        for (const kind of [KIND, EVERY_KIND, "document.issued"]) {
          expect(reaches(choices, channel, kind), JSON.stringify({ choices, channel, kind })).toBe(
            !isOptedOut(choices, channel, kind),
          );
        }
      }
    }
  });
});

/** The kinds the domain's modules notify with, read from their sources (`kind: "share-link.opened"`). */
async function kindsSent(): Promise<string[]> {
  const domain = new URL("../../../../packages/domain/src/", import.meta.url);
  const files = (await readdir(domain, { recursive: true })).filter((file) => file.endsWith(".ts"));
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, domain), "utf8")));
  return [...new Set(sources.flatMap((source) => [...source.matchAll(SENT_KIND)].map(([, kind]) => kind ?? "")))];
}

const SENT_KIND = /\bkind: "([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)"/g;

describe("notificationKinds", () => {
  it("lists every kind a module notifies with, so each can be chosen", async () => {
    const sent = await kindsSent();
    expect(sent).toContain(KIND);
    expect(notificationKinds.map(({ kind }) => kind)).toEqual(expect.arrayContaining(sent));
  });

  it("gives each kind a label and a hint", () => {
    for (const { kind, messageKey } of notificationKinds) {
      const words = messages.notifications.preferences.kinds[messageKey];
      expect(words.label, kind).not.toBe("");
      expect(words.hint, kind).not.toBe("");
    }
  });
});
