"use client";

// The new agent's staged actions in the owner's words, one sentence each, for Try it: the trip by its name, a day as
// "12 Dec", money as ₹ with lakh grouping and a follow-up's time in the agency's zone, never a record id or a UTC time.
import type { NaturalDryAction } from "@travel-crm/contracts/ai";
import { money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { formatCalendarDay, formatDayTime, formatRupees } from "@/lib/format";
import { useMe } from "@/session/me-context";

type ActionOf<Tool extends NaturalDryAction["tool"]> = Extract<NaturalDryAction, { tool: Tool }>;

/** The turn's action of that tool, if it staged one (a turn stages each tool once at most). */
export function actionOf<Tool extends NaturalDryAction["tool"]>(
  actions: readonly NaturalDryAction[],
  tool: Tool,
): ActionOf<Tool> | undefined {
  return actions.find((action): action is ActionOf<Tool> => action.tool === tool);
}

const rupees = (paise: number) => formatRupees(money(paise));

/** What a staged action would do, as a sentence. */
export function useActionWords(): (action: NaturalDryAction) => string {
  const t = useTranslations("ai.test.natural");
  const { timeZone } = useMe().organization;
  return (action) => {
    switch (action.tool) {
      case "update_lead":
        return action.fields.length === 0
          ? t("actions.updateNotes")
          : t("actions.updateLead", { fields: action.fields.map((field) => t(`fields.${field}`)).join(", ") });
      case "send_brochure":
        return t("actions.sendBrochure", { trip: action.trip, files: action.files });
      case "offer_booking":
        return t("actions.offerBooking", {
          trip: action.trip,
          date: formatCalendarDay(action.date),
          people: action.people,
          total: rupees(action.totalPaise),
          advance: rupees(action.advancePaise),
        });
      case "book":
        return t("actions.book", {
          seats: action.seats,
          trip: action.trip,
          date: formatCalendarDay(action.date),
          advance: rupees(action.advancePaise),
        });
      case "resend_payment":
        return t("actions.resendPayment");
      case "plan_follow_up":
        return action.at === null
          ? t("actions.noFollowUp")
          : t("actions.followUp", { time: formatDayTime(new Date(action.at), { timeZone }), about: action.about });
      case "create_task":
        return t(action.kind === "call_back" ? "actions.callBack" : "actions.task", { text: action.text });
      case "add_note":
        return t("actions.note", { text: action.text });
      case "hand_over":
        return t("actions.handOver", { reason: t(`handOverReasons.${action.reason}`), summary: action.summary });
      case "suggest_close":
        return t(action.kind === "lost" ? "actions.suggestLost" : "actions.suggestNotALead", { reason: action.reason });
      case "stay_quiet":
        return t("quiet", { reason: action.reason });
    }
  };
}
