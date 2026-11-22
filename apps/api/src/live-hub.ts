// The live streams this api process holds open (inbox revamp spec, part 1 item 4), and what each hears: a notification of a
// changed chat (inbox_live, through @travel-crm/db's listener) goes to the streams of its organization whose member may see
// that chat, by the list's own rule (maySeeChat on the chat's audience). Notifications are gathered for GATHER_MS and each
// organization's chats read in one transaction, at most READS_AT_ONCE at a time, so a burst (a broadcast's delivery
// reports) is a few reads, not one per report. A member may hold MAX_LIVE_STREAMS_PER_MEMBER at once. When an organization's
// access may have changed (the access cache forgot it), its streams read their member's access again at their next beat.
// One process's streams only: behind several api processes each holds its own, and every process listens.
import { MAX_LIVE_STREAMS_PER_MEMBER, type InboxLiveEvent } from "@travel-crm/contracts/inbox";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { maySeeChat, type ChatAudience, type InboxNotification } from "@travel-crm/domain/inbox";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

/** One open stream: whose it is (their access, renewed while it lasts), how to send it an event, and how to end it. */
export interface LiveStream {
  access: MemberAccess;
  send: (event: InboxLiveEvent) => void;
  close: () => void;
  /** Their access may have changed: read it again soon. */
  recheckSoon: () => void;
}

export interface LiveHub {
  /** Adds a stream and returns how to remove it, or null when its member already holds as many as they may. */
  join: (stream: LiveStream) => (() => void) | null;
  /** Sends a notification, within GATHER_MS, to the streams that may hear of its chat. */
  deliver: (notification: InboxNotification) => void;
  /** Resolves once everything delivered so far has been sent (for tests). */
  settled: () => Promise<void>;
  /** The organization's access may have changed: each of its streams reads its member's access again soon. */
  forgetOrganization: (organizationId: string) => void;
  /** Ends every stream: what was notified while the listener was away is lost, and each browser reads afresh as it reconnects. */
  closeAll: () => void;
  /** How many streams are open, for the log. */
  size: () => number;
}

/** Notifications this close together share their audiences' reads. */
export const GATHER_MS = 50;
/** Audience reads running at once, across organizations, so the streams never take the requests' connections. */
export const READS_AT_ONCE = 2;

export function createLiveHub({
  audiencesOf,
  logger,
  maxPerMember = MAX_LIVE_STREAMS_PER_MEMBER,
}: {
  /** Each chat's audience, read in one transaction of the organization. */
  audiencesOf: (organizationId: string, conversationIds: readonly string[]) => Promise<Map<string, ChatAudience>>;
  logger: Logger;
  maxPerMember?: number;
}): LiveHub {
  const byOrganization = new Map<string, Set<LiveStream>>();
  /** Notifications waiting for their audiences, by organization, in the order they came. */
  let waiting = new Map<string, InboxLiveEvent[]>();
  let gathering: ReturnType<typeof setTimeout> | undefined;
  const queue: [string, InboxLiveEvent[]][] = [];
  let reading = 0;
  let idle: (() => void)[] = [];

  const memberKey = (access: MemberAccess) => `${access.organizationId}:${access.userId}`;
  const busy = () => gathering !== undefined || queue.length > 0 || reading > 0;
  const tellIdle = () => {
    if (busy()) return;
    const waiters = idle;
    idle = [];
    for (const resolve of waiters) resolve();
  };

  async function send(organizationId: string, events: InboxLiveEvent[]): Promise<void> {
    const streams = byOrganization.get(organizationId);
    if (streams === undefined || streams.size === 0) return;
    const ids = [...new Set(events.map((event) => event.conversationId))];
    let audiences: Map<string, ChatAudience>;
    try {
      audiences = await audiencesOf(organizationId, ids);
    } catch (error) {
      // Nobody hears of these changes now; the browsers' slow poll still shows them.
      logger.warn(
        { organizationId, chats: ids.length, ...errorFields(error) },
        "live: chats' audiences could not be read",
      );
      return;
    }
    for (const event of events) {
      const audience = audiences.get(event.conversationId);
      if (audience === undefined) continue;
      for (const stream of streams) if (maySeeChat(stream.access, audience)) stream.send(event);
    }
  }

  const readNext = () => {
    while (reading < READS_AT_ONCE) {
      const next = queue.shift();
      if (next === undefined) break;
      reading += 1;
      void send(...next).finally(() => {
        reading -= 1;
        readNext();
      });
    }
    tellIdle();
  };

  const flush = () => {
    gathering = undefined;
    const gathered = waiting;
    waiting = new Map();
    queue.push(...gathered);
    readNext();
  };

  return {
    join: (stream) => {
      const streams = byOrganization.get(stream.access.organizationId) ?? new Set<LiveStream>();
      const mine = [...streams].filter((open) => memberKey(open.access) === memberKey(stream.access));
      if (mine.length >= maxPerMember) return null;
      streams.add(stream);
      byOrganization.set(stream.access.organizationId, streams);
      return () => {
        streams.delete(stream);
        if (streams.size === 0 && byOrganization.get(stream.access.organizationId) === streams) {
          byOrganization.delete(stream.access.organizationId);
        }
      };
    },
    deliver: ({ organizationId, ...event }) => {
      // An organization nobody streams is not read at all.
      if ((byOrganization.get(organizationId)?.size ?? 0) === 0) return;
      const events = waiting.get(organizationId) ?? [];
      events.push(event);
      waiting.set(organizationId, events);
      gathering ??= setTimeout(flush, GATHER_MS);
    },
    settled: () =>
      busy()
        ? new Promise<void>((resolve) => {
            idle.push(resolve);
          })
        : Promise.resolve(),
    forgetOrganization: (organizationId) => {
      for (const stream of byOrganization.get(organizationId) ?? []) stream.recheckSoon();
    },
    closeAll: () => {
      for (const streams of byOrganization.values()) for (const stream of streams) stream.close();
    },
    size: () => {
      let total = 0;
      for (const streams of byOrganization.values()) total += streams.size;
      return total;
    },
  };
}
