// Deliveries are at least once and can overlap: a channel is claimed with a lease before it is sent, so two runs send
// once, a crashed run's claim is taken over, and "sent" is recorded only after the send worked.
import { describe, expect, it } from "vitest";
import { type EmailSender } from "@travel-crm/integrations/email";
import { deliver, useDeliveryKit } from "./delivery-kit.js";

const MINUTE = 60_000;

describe("claiming deliveries", () => {
  const kit = useDeliveryKit("Claims");

  const claimEmail = (id: string, at: Date) =>
    kit.db.forOrg(kit.organizationId, (tx) => tx.notification.update({ where: { id }, data: { emailClaimedAt: at } }));

  it("sends once when the same delivery runs twice at the same time, to each browser once", async () => {
    const asha = kit.addMember("asha@agency.example");
    const phone = await kit.subscribe(asha, "phone");
    const laptop = await kit.subscribe(asha, "laptop");
    const { event } = await kit.notifyMember(asha);
    const slowEmail: EmailSender = {
      send: async (message) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await kit.email.send(message);
      },
    };

    const runs = await Promise.allSettled([
      deliver(kit, event, { email: slowEmail }),
      deliver(kit, event, { email: slowEmail }),
    ]);

    expect(kit.email.sent).toHaveLength(1);
    expect(kit.push.sent.map((sent) => sent.subscription.endpoint).sort()).toEqual([laptop, phone].sort());
    // A run that lost a claim to a run still sending asks to be retried, rather than assume it went out.
    for (const run of runs) {
      if (run.status === "rejected") expect(String(run.reason)).toMatch(/another run/);
    }
  });

  it("takes over a claim older than the lease when nothing was sent, as its run must have crashed", async () => {
    const { id, event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    await claimEmail(id, new Date(Date.now() - 10 * MINUTE));

    await deliver(kit, event);

    expect(kit.email.sent).toHaveLength(1);
    expect((await kit.row(id)).emailedAt).toBeInstanceOf(Date);
  });

  it("asks to be retried while another run holds a fresh claim, and sends nothing itself", async () => {
    const { id, event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    await claimEmail(id, new Date());

    await expect(deliver(kit, event)).rejects.toThrow(/another run/);

    expect(kit.email.sent).toEqual([]);
    expect((await kit.row(id)).emailedAt).toBeNull();
  });

  it("skips quietly when the run holding the claim has finished sending", async () => {
    const { id, event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    await kit.db.forOrg(kit.organizationId, (tx) =>
      tx.notification.update({ where: { id }, data: { emailClaimedAt: new Date(), emailedAt: new Date() } }),
    );

    await deliver(kit, event);

    expect(kit.email.sent).toEqual([]);
  });
});
