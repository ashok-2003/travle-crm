// What a submission must satisfy beyond its shape: the form's modes (W2), no links where a link is spam (W38), and the bot
// check's answer (W39). A person can fix and resend any of the first two; a bot learns nothing from either.
import { containsWebAddress, type EnquiryAnswers } from "@travel-crm/contracts/website-forms";
import { DomainError } from "../kernel/index.js";
import { formLimits } from "./limits.js";
import type { WebsiteFormRow } from "./settings.js";

const required = (field: string) =>
  new DomainError("VALIDATION", "FORM_ANSWER_REQUIRED", `The ${field} field is required`);

/**
 * The answers against the form's current modes: a required field that is missing is VALIDATION, and a field that is off
 * (or the tickbox, when the form has none) is dropped. An empty message counts as not answered, and so does a travel
 * month of "Not sure yet" where a month is required.
 */
export function assertAnswersMatchModes(form: WebsiteFormRow, answers: EnquiryAnswers): EnquiryAnswers {
  const message = answers.message?.trim() ? answers.message.trim() : undefined;
  const given = {
    email: answers.email !== undefined,
    destination: answers.destination !== undefined,
    travelMonth: answers.travelMonth !== undefined && answers.travelMonth !== null,
    travellers: answers.adults !== undefined,
    budget: answers.budget !== undefined,
    message: message !== undefined,
  };
  const modes = {
    email: form.emailMode,
    destination: form.destinationMode,
    travelMonth: form.travelMonthMode,
    travellers: form.travellersMode,
    budget: form.budgetMode,
    message: form.messageMode,
  };
  for (const field of Object.keys(modes) as (keyof typeof modes)[]) {
    if (modes[field] === "required" && !given[field]) throw required(field);
  }
  const kept: EnquiryAnswers = { name: answers.name, phone: answers.phone };
  if (modes.email !== "off" && answers.email !== undefined) kept.email = answers.email;
  if (modes.destination !== "off" && answers.destination !== undefined) kept.destination = answers.destination;
  if (modes.travelMonth !== "off" && answers.travelMonth !== undefined) kept.travelMonth = answers.travelMonth;
  if (modes.travellers !== "off") {
    if (answers.adults !== undefined) kept.adults = answers.adults;
    if (answers.childrenAges !== undefined) kept.childrenAges = answers.childrenAges;
  }
  if (modes.budget !== "off" && answers.budget !== undefined) kept.budget = answers.budget;
  if (modes.message !== "off" && message !== undefined) kept.message = message;
  if (form.offersTickbox && answers.offers !== undefined) kept.offers = answers.offers;
  return kept;
}

const WEB_LINK = /(?:https?:\/\/|www\.)\S+/gi;
const HTML_TAG = /<\/?[a-z!][^>]*>/i;

const noLinks = () => new DomainError("VALIDATION", "FORM_LINKS_NOT_ALLOWED", "Links are not allowed in an enquiry");

/** A message with more than two web addresses or an HTML tag is refused; the name and a typed destination may hold none. */
export function assertNoLinks(answers: EnquiryAnswers): void {
  const message = answers.message ?? "";
  if ((message.match(WEB_LINK) ?? []).length > formLimits.maxLinks || HTML_TAG.test(message)) throw noLinks();
  if (containsWebAddress(answers.name)) throw noLinks();
  if (answers.destination?.kind === "typed" && containsWebAddress(answers.destination.text)) throw noLinks();
}

/** Turnstile's answer. A "no" is refused; a Cloudflare that cannot be reached lets the enquiry in (W39: fail open). */
export function assertNotBot(result: "pass" | "fail" | "unreachable"): void {
  if (result === "fail") {
    throw new DomainError("VALIDATION", "FORM_BOT_CHECK_FAILED", "The bot check could not tell this is a person");
  }
}
