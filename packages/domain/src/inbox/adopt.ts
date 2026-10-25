// Chats stored while the subscription did not allow changes get their person and lead once access returns (spec 8.5, D11): an
// hourly pass over routed connections finds chats with no person and makes them the way a new message would. Cheap, since chats
// are few. Nothing is made for a paused or cancelled number.
import { agencyFactsOf, mayBringIn, receiveWhatsAppContact } from "../crm/index.js";
import { systemActor } from "../kernel/index.js";
import type { InboxDependencies } from "./dependencies.js";
import { firstTextOf } from "./messages.js";
import { routesPage } from "./routes.js";

const PAGE = 100;

/** Makes the leads for one organization's chats with no person; returns how many chats were handled. */
export async function adoptChats(dependencies: InboxDependencies, organizationId: string, now: Date): Promise<number> {
  if (!(await mayBringIn(dependencies, organizationId))) return 0;
  const facts = await agencyFactsOf(dependencies, organizationId);
  if (facts === null) return 0;
  return dependencies.db.forOrg(organizationId, async (tx) => {
    const connection = await tx.whatsappConnection.findFirst({
      where: { status: { in: ["connected", "problem"] } },
      select: { id: true },
    });
    if (connection === null) return 0;
    const chats = await tx.whatsappConversation.findMany({
      where: { connectionId: connection.id, personId: null, hidden: false, state: "open" },
      select: { id: true, phoneE164: true, profileName: true, lastInboundAt: true },
      take: 50,
    });
    let handled = 0;
    for (const chat of chats) {
      const first = await tx.whatsappMessage.findFirst({
        where: { conversationId: chat.id, direction: "in" },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: { kind: true, body: true, caption: true, occurredAt: true },
      });
      if (first === null) continue;
      const outcome = await receiveWhatsAppContact(
        tx,
        systemActor(organizationId),
        {
          phoneE164: chat.phoneE164,
          profileName: chat.profileName,
          firstText: firstTextOf({ kind: first.kind as never, text: first.body, caption: first.caption }),
          occurredAt: first.occurredAt,
          previousInboundAt: null,
        },
        { ownerUserId: facts.ownerUserId, workers: facts.workers },
        now,
      );
      await tx.whatsappConversation.update({
        where: { id: chat.id },
        data:
          outcome.kind === "blocked" ? { hidden: true, personId: outcome.personId } : { personId: outcome.personId },
      });
      handled += 1;
    }
    return handled;
  });
}

/** One pass over every routed connection's organization. */
export async function adoptAll(dependencies: InboxDependencies, now: Date): Promise<number> {
  let total = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: PAGE });
    for (const route of page) total += await adoptChats(dependencies, route.organizationId, now);
    if (page.length < PAGE) return total;
    after = page.at(-1)?.integratedNumber;
  }
}
