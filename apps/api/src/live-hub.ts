// The live streams this api process holds open (inbox revamp spec, part 1 item 4), and what each hears: a notification of a
// changed chat (inbox_live, through @travel-crm/db's listener) goes to the streams of its organization whose member may see
// that chat, by the list's own rule (maySeeChat on the chat's audience, read once per chat and second, however many
// streams ask). A member may hold MAX_LIVE_STREAMS_PER_MEMBER at once. One process's streams only: behind several api
// processes each holds its own, and every process listens, so each still hears every change.
import { MAX_LIVE_STREAMS_PER_MEMBER, type InboxLiveEvent } from "@travel-crm/contracts/inbox";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { maySeeChat, type ChatAudience, type InboxNotification } from "@travel-crm/domain/inbox";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

/** One open stream: whose it is (their access, renewed while it lasts), how to send it an event, and how to end it. */
export interface LiveStream {
  access: MemberAccess;
  send(event: InboxLiveEvent): void;
  close(): void;
}

export interface LiveHub {
  /** Adds a stream and returns how to remove it, or null when its member already holds as many as they may. */
  join(stream: LiveStream): (() => void) | null;
  /** Sends a notification to the streams that may hear of its chat. */
  deliver(notification: InboxNotification): Promise<void>;
  /** Ends every stream: what was notified while the listener was away is lost, and each browser reads afresh as it reconnects. */
  closeAll(): void;
  /** How many streams are open, for the log. */
  size(): number;
}

/** A chat's audience is read once for every notification about it within this long (one message often notifies twice). */
const AUDIENCE_KEPT_MS = 1_000;

export function createLiveHub({
  audienceOf,
  logger,
  maxPerMember = MAX_LIVE_STREAMS_PER_MEMBER,
  now = Date.now,
}: {
  audienceOf: (organizationId: string, conversationId: string) => Promise<ChatAudience>;
  logger: Logger;
  maxPerMember?: number;
  now?: () => number;
}): LiveHub {
  const byOrganization = new Map<string, Set<LiveStream>>();
  const audiences = new Map<string, { until: number; audience: Promise<ChatAudience> }>();

  const memberKey = (access: MemberAccess) => `${access.organizationId}:${access.userId}`;
  const audience = (organizationId: string, conversationId: string) => {
    const at = now();
    for (const [key, kept] of audiences) if (kept.until <= at) audiences.delete(key);
    const key = `${organizationId}:${conversationId}`;
    const kept = audiences.get(key);
    if (kept !== undefined) return kept.audience;
    const read = audienceOf(organizationId, conversationId);
    audiences.set(key, { until: at + AUDIENCE_KEPT_MS, audience: read });
    // A failed read is not kept: the next notification asks again.
    read.catch(() => audiences.delete(key));
    return read;
  };

  return {
    join(stream) {
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
    async deliver({ organizationId, ...event }) {
      const streams = byOrganization.get(organizationId);
      if (streams === undefined || streams.size === 0) return;
      let read: ChatAudience;
      try {
        read = await audience(organizationId, event.conversationId);
      } catch (error) {
        // Nobody hears of this change now; the browsers' slow poll still shows it.
        logger.warn({ organizationId, ...errorFields(error) }, "live: a chat's audience could not be read");
        return;
      }
      for (const stream of streams) if (maySeeChat(stream.access, read)) stream.send(event);
    },
    closeAll() {
      for (const streams of byOrganization.values()) for (const stream of streams) stream.close();
    },
    size() {
      let total = 0;
      for (const streams of byOrganization.values()) total += streams.size;
      return total;
    },
  };
}
