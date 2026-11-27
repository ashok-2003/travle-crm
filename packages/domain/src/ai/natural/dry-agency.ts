// The agency as a natural dry turn reads it (Try it, the bench), in one transaction: its clock, the trips it sells today as
// the model reads them, the owner's answers, the agent's voice, and the payment lines code sends after a hold (null until
// the payment QR is set, when no booking can be taken).
import type { AgencyAnswers } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import { organizationTimeZone } from "../../identity/index.js";
import { calendarDateIn, type CalendarDate } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, paymentLinesOf } from "../../profile/index.js";
import { sellablePackages } from "../../quotes/index.js";
import { agencyAnswersOf, agencyContactOf, agentBasicsOf, type AgencyContact } from "../agency-answers.js";
import type { AgentVoice } from "./prompt.js";
import { tripSheetsOf } from "./trips/trip-sheets.js";
import type { TripSheet } from "./types.js";

export interface DryAgency {
  timeZone: string;
  today: CalendarDate;
  sheets: TripSheet[];
  answers: AgencyAnswers;
  contact: AgencyContact;
  voice: AgentVoice;
  paymentLines: string[] | null;
}

export function dryAgency(db: Database, organizationId: string, agencyName: string, now: Date): Promise<DryAgency> {
  return db.forOrg(organizationId, async (tx) => {
    const timeZone = await organizationTimeZone(tx, organizationId);
    const today = calendarDateIn(now, timeZone);
    const [sellable, basics, answers, payment] = await Promise.all([
      sellablePackages(tx, organizationId, today),
      agentBasicsOf(tx),
      agencyAnswersOf(tx),
      agencyPaymentDetailsOf(tx, organizationId),
    ]);
    return {
      timeZone,
      today,
      sheets: await tripSheetsOf(tx, sellable, today, now),
      answers,
      contact: await agencyContactOf(tx, organizationId),
      voice: { agentName: basics.agentName, agencyName },
      paymentLines: paymentDetailsReady(payment) ? paymentLinesOf(payment) : null,
    };
  });
}
