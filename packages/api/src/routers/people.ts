// people.*: a person's marketing consent as the lead page's person card shows it (website form spec 3.9, ruling F13). Both
// take the lead's id, checked in scope like the lead page, so nobody names a person they cannot see.
import { leadIdInput, personConsentState } from "@travel-crm/contracts/crm";
import { consentStateOf, getLead, withdrawConsent } from "@travel-crm/domain/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

async function stateFor(tx: OrgTx, member: MemberAccess, leadId: string) {
  const { person } = await getLead(tx, member, leadId);
  const state = await consentStateOf(tx, person.id);
  return {
    personId: person.id,
    state: { state: state.state, at: state.at?.toISOString() ?? null, fromForm: state.fromForm },
  };
}

export const peopleRouter = router({
  consent: orgProcedure
    .requires("leads:view")
    .input(leadIdInput)
    .output(personConsentState)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => (await stateFor(tx, ctx.member, input.leadId)).state),
    ),

  /** Records that the person asked to stop offers, say by WhatsApp. A person who never agreed is left as they are. */
  withdrawConsent: orgProcedure
    .requires("leads:edit")
    .input(leadIdInput)
    .output(personConsentState)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const { personId } = await stateFor(tx, ctx.member, input.leadId);
        await withdrawConsent(tx, ctx.member, { personId, now: new Date() });
        return (await stateFor(tx, ctx.member, input.leadId)).state;
      }),
    ),
});
