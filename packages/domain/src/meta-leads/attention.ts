// A Page that stops giving leads (M3, spec 11): its token no longer works, or is about to stop, or a form gained a
// question nobody matched. Entering one records the change once, by the system, and publishes meta.attention for the one
// notice to the Owner; coming back to running is recorded and told to nobody.
import { metaAttentionEvent, type MetaAttentionKind } from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { defineListener, type EventListener, publishEvent } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { Identity } from "../identity/index.js";
import { uuidFromText } from "../sheets/index.js";
import { pageOf, type MetaPageRow } from "./page-row.js";

/**
 * A running Page whose token failed becomes needs_reconnect: recorded by the system, and told once (the same state twice
 * notifies once). A paused or disconnected Page stays as it is; the person's Pause is never undone by a failure. Returns
 * whether it changed.
 */
export async function enterNeedsReconnect(
  tx: OrgTx,
  page: Pick<MetaPageRow, "id" | "organizationId" | "status">,
  now: Date,
): Promise<boolean> {
  if (page.status !== "running") return false;
  await tx.metaPage.update({ where: { id: page.id }, data: { status: "needs_reconnect", attentionSince: now } });
  await recordAudit(tx, systemActor(page.organizationId), {
    action: "meta.access-lost",
    entityType: "meta_page",
    entityId: page.id,
    after: { status: "needs_reconnect" },
  });
  await publishEvent(tx, { type: "meta.attention", payload: { pageId: page.id, kind: "needs_reconnect" } });
  await publishEvent(tx, { type: "meta.page-changed", payload: { pageId: page.id } });
  return true;
}

/** A form that gained or lost a question since it was matched needs a look: its leads still go to the note (spec 3.4). */
export async function enterFormNeedsAttention(
  tx: OrgTx,
  input: { page: Pick<MetaPageRow, "id" | "organizationId">; form: { id: string; state: string }; now: Date },
): Promise<boolean> {
  if (input.form.state !== "running") return false;
  await tx.metaForm.update({ where: { id: input.form.id }, data: { state: "needs_attention" } });
  await recordAudit(tx, systemActor(input.page.organizationId), {
    action: "meta.form-questions-changed",
    entityType: "meta_page",
    entityId: input.page.id,
    after: { formId: input.form.id, state: "needs_attention" },
  });
  await publishEvent(tx, {
    type: "meta.attention",
    payload: { pageId: input.page.id, kind: "form_changed", formId: input.form.id },
  });
  return true;
}

/** What the Owner reads for each kind: what happened, and what to do. */
function wordsFor(kind: MetaAttentionKind, page: Pick<MetaPageRow, "pageName">, formName: string | null) {
  const name = `'${page.pageName.slice(0, 80)}'`;
  switch (kind) {
    case "needs_reconnect":
      return { title: `We can't read leads from your Page ${name} any more`, body: "Connect it again." };
    case "token_expiring":
      return { title: `Facebook's access to your Page ${name} ends soon`, body: "Connect it again before it does." };
    case "form_changed":
      return {
        title: `'${(formName ?? "A form").slice(0, 80)}' has a new question we haven't matched`,
        body: "Look at its questions. Answers still reach the lead's note meanwhile.",
      };
  }
}

/**
 * meta.notify-attention: on meta.attention, the agency Owner is told once for the change (the event's id is the notice's
 * source, so a repeat adds nothing), even when someone else connected the Page. A Page that has left the state by the
 * time the listener runs is not told.
 */
export function attentionListener(dependencies: { identity: Pick<Identity, "firstOwner"> }): EventListener {
  return defineListener({
    name: "meta.notify-attention",
    eventType: "meta.attention",
    payload: metaAttentionEvent,
    handle: async (event, context) => {
      const { pageId, kind, formId } = event.payload;
      const page = await context.forOrg((tx) => pageOf(tx, pageId));
      if (page === null || page.status === "disconnected") return;
      if (kind === "needs_reconnect" && page.status !== "needs_reconnect") return;
      const owner = await dependencies.identity.firstOwner(page.organizationId);
      if (owner === null) return;
      const formName =
        formId === undefined
          ? null
          : await context.forOrg(
              async (tx) => (await tx.metaForm.findFirst({ where: { id: formId } }))?.formName ?? null,
            );
      const words = wordsFor(kind, page, formName);
      await context.forOrg((tx) =>
        notify(tx, context.actor, {
          recipientUserIds: [owner],
          sourceEventId: event.id,
          kind: "meta.needs-attention",
          title: words.title,
          body: words.body,
          link: `/settings/lead-sources/meta/pages/${page.id}`,
          channels: ["push"],
        }),
      );
    },
  });
}

/** A notice's source for a fact that can happen again later, made from the fact so a retry adds nothing. */
export const noticeSourceOf = (...parts: string[]) => uuidFromText(`meta-notice:${parts.join(":")}`);
