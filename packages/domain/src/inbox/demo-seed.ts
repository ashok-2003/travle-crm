// The demo agency's WhatsApp (spec 10): a connection of mode demo (no number, no route, so MSG91 can never be reached from
// there) and three sample chats without media: a new enquiry from a number we don't know, a lead mid-conversation with a
// reply, and a past customer. Reading works; sending says "Not available in the demo". Built inside the nightly reset's
// transaction, as the system.
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";

const HOUR = 3_600_000;

export async function addDemoWhatsApp(tx: OrgTx, actor: Actor, now: Date): Promise<void> {
  const connection = await tx.whatsappConnection.create({
    data: {
      integratedNumber: "",
      displayNumber: "+919000000000",
      mode: "demo",
      status: "connected",
      connectedAt: now,
      createdBy: actor.userId,
    },
    select: { id: true },
  });
  const people = await tx.person.findMany({
    where: { phoneE164: { not: null } },
    orderBy: { id: "asc" },
    take: 6,
    select: { id: true, name: true, phoneE164: true, leads: { select: { stage: true } } },
  });
  const isClosed = (leads: { stage: string }[]) =>
    leads.length > 0 && leads.every((lead) => ["won", "lost", "not_a_lead"].includes(lead.stage));
  const open = people.find((person) =>
    person.leads.some((lead) => !["won", "lost", "not_a_lead"].includes(lead.stage)),
  );
  const past =
    people.find((person) => isClosed(person.leads) && person.id !== open?.id) ??
    people.find((person) => person.id !== open?.id);

  interface Seed {
    phone: string;
    personId: string | null;
    profileName: string | null;
    messages: { direction: "in" | "out"; text: string; hoursAgo: number; status: string }[];
  }
  const seeds: Seed[] = [
    {
      phone: "+919000000001",
      personId: null,
      profileName: "Meera Nair",
      messages: [
        {
          direction: "in",
          text: "Hi, we are 4 adults looking at Kerala in December. Can you share a plan?",
          hoursAgo: 2,
          status: "received",
        },
        { direction: "in", text: "Budget around 60k per person.", hoursAgo: 2, status: "received" },
      ],
    },
    ...(open?.phoneE164 == null
      ? []
      : [
          {
            phone: open.phoneE164,
            personId: open.id,
            profileName: null,
            messages: [
              {
                direction: "in" as const,
                text: "Is the Spiti trip still available in June?",
                hoursAgo: 20,
                status: "received",
              },
              {
                direction: "out" as const,
                text: "Yes, there are seats on 12 June. I will send the itinerary shortly.",
                hoursAgo: 19,
                status: "read",
              },
              { direction: "in" as const, text: "Great, please do.", hoursAgo: 5, status: "received" },
            ],
          },
        ]),
    ...(past?.phoneE164 == null
      ? []
      : [
          {
            phone: past.phoneE164,
            personId: past.id,
            profileName: null,
            messages: [
              { direction: "in" as const, text: "Thanks for the lovely trip!", hoursAgo: 30, status: "received" },
            ],
          },
        ]),
  ];
  for (const seed of seeds) {
    const chat = await tx.whatsappConversation.create({
      data: {
        connectionId: connection.id,
        phoneE164: seed.phone,
        personId: seed.personId,
        profileName: seed.profileName,
      },
      select: { id: true },
    });
    let lastInbound: Date | null = null;
    let last: { id: string; at: Date; direction: string } | null = null;
    for (const message of seed.messages) {
      const at = new Date(now.getTime() - message.hoursAgo * HOUR);
      const row = await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: message.direction,
          origin: message.direction === "in" ? "customer" : "staff_crm",
          kind: "text",
          body: message.text,
          status: message.status,
          occurredAt: at,
          ...(message.direction === "out" ? { sentAt: at, deliveredAt: at, readAt: at } : {}),
        },
        select: { id: true },
      });
      if (message.direction === "in") lastInbound = at;
      last = { id: row.id, at, direction: message.direction };
    }
    await tx.whatsappConversation.update({
      where: { id: chat.id },
      data: {
        lastInboundAt: lastInbound,
        lastMessageAt: last?.at ?? null,
        lastMessageId: last?.id ?? null,
        needsReply: last?.direction === "in",
      },
    });
  }
}
