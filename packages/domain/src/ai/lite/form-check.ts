// Keeps of the Understand form only what the customer's own words back: a detail without its proof becomes null.
import type { AiFilledField } from "@travel-crm/contracts/crm";
import type { LiteIntent, UnderstandForm } from "@travel-crm/contracts/ai";
import { withoutAmountsAndDates } from "@travel-crm/contracts/ai";
import type { RoomType } from "@travel-crm/contracts/quotes";
import type { CalendarDate } from "../../kernel/index.js";
import { containsWords, hasAWord, sharesAWord } from "../grounded/read-words.js";
import { saysCount, saysDay, saysMonth } from "../grounded/read-numbers.js";
import type { CheckedForm, ContextMessage, FieldProof, PackageIndexEntry } from "./types.js";

const MOST_MESSAGES = 20;
const OUR_LAST = 6;
const SUMMARY_MAX = 800;
const EXCERPT_MAX = 200;
/** These need words said since our last message, or they are only history. */
const NEEDS_NEWEST: LiteIntent[] = ["wants_to_book", "payment_sent", "not_interested", "later", "wants_call"];

const roomAliases: Record<RoomType, string[]> = {
  double: ["double", "2 sharing", "twin", "डबल"],
  triple: ["triple", "3 sharing", "ट्रिपल"],
  quad: ["quad", "4 sharing"],
  single: ["single", "सिंगल"],
  child_bed: ["child bed"],
  child_no_bed: ["child no bed"],
};

export function checkedForm(
  form: UnderstandForm,
  messages: ContextMessage[],
  burst: ContextMessage[],
  index: PackageIndexEntry[],
  today: CalendarDate,
): CheckedForm {
  const customer = messages.slice(-MOST_MESSAGES).filter((message) => message.from === "customer");
  const proofIn = (lines: ContextMessage[], proof: string): string[] =>
    hasAWord(proof) ? lines.filter((line) => containsWords(line.text, proof)).map((line) => line.id) : [];
  const dropped: string[] = [];
  const proofs: Partial<Record<AiFilledField, FieldProof>> = {};
  const details = form.details;

  /** The proof's messages when it is found and `holds`; else the detail is dropped and its code noted. */
  function backed(code: string, proof: string, holds: boolean, lines = customer): string[] | null {
    const ids = holds ? proofIn(lines, proof) : [];
    if (ids.length === 0) {
      dropped.push(code);
      return null;
    }
    return ids;
  }
  const remember = (field: AiFilledField, proof: string, messageIds: string[]) => {
    proofs[field] = { excerpt: proof.slice(0, EXCERPT_MAX), messageIds };
  };

  const intents = form.intents.filter((intent) => {
    if (!NEEDS_NEWEST.includes(intent.name)) return true;
    const ok = proofIn(burst, intent.proof).length > 0;
    if (!ok) dropped.push(`intent:${intent.name}`);
    return ok;
  });

  const ourLast = messages.slice(-OUR_LAST).filter((message) => message.from !== "customer");
  const entry = details.package
    ? index.find((one) => one.title.toLowerCase() === details.package?.name.toLowerCase())
    : undefined;
  let pack = details.package;
  if (pack) {
    const named =
      entry !== undefined &&
      (sharesAWord(pack.proof, `${entry.title} ${entry.place ?? ""}`, 4) ||
        ourLast.some((line) => containsWords(line.text, entry.title)));
    const ids = backed("package", pack.proof, named);
    if (ids === null) pack = null;
    else remember("destination", pack.proof, ids);
  }

  let place = details.place;
  if (place) {
    const ids = backed("place", place.proof, containsWords(place.proof, place.words));
    if (ids === null) place = null;
    else if (!proofs.destination) remember("destination", place.proof, ids);
  }

  let date = details.date;
  if (date) {
    const day = date.day !== null && date.day >= today && saysDay(date.proof, date.day) ? date.day : null;
    const thisMonth = today.slice(0, 7);
    const month =
      date.month !== null && date.month >= thisMonth && saysMonth(date.proof, date.month) ? date.month : null;
    const ids = backed("date", date.proof, day !== null || month !== null);
    if (ids === null) date = null;
    else {
      date = { ...date, day, month };
      remember("when", date.proof, ids);
    }
  }

  let adults = details.adults;
  if (adults) {
    const ids = backed("adults", adults.proof, saysCount(adults.proof, adults.count));
    if (ids === null) adults = null;
    else remember("adults", adults.proof, ids);
  }

  let children = details.children;
  if (children) {
    const proof = children.proof;
    const ids = backed("children", proof, saysCount(proof, children.count));
    if (ids === null) children = null;
    else {
      const ages = children.ages.every((age) => saysCount(proof, age)) ? children.ages : [];
      children = { ...children, ages };
      if (ages.length > 0) remember("children_ages", proof, ids);
    }
  }

  let name = details.name;
  if (name) {
    const ids = backed("name", name.proof, containsWords(name.proof, name.full));
    if (ids === null) name = null;
    else remember("name", name.proof, ids);
  }

  let pickup = details.pickup_city;
  if (pickup) {
    const ids = backed("pickup_city", pickup.proof, containsWords(pickup.proof, pickup.words));
    if (ids === null) pickup = null;
    else remember("departure_city", pickup.proof, ids);
  }

  let room = details.room;
  if (room) {
    const type = room.type;
    const ids = backed(
      "room",
      room.proof,
      roomAliases[type].some((alias) => containsWords(room?.proof ?? "", alias)),
    );
    if (ids === null) room = null;
    else remember("room_type", room.proof, ids);
  }

  let payInFull = details.pay_in_full;
  if (payInFull && backed("pay_in_full", payInFull.proof, true, burst) === null) payInFull = null;

  return {
    form: {
      ...form,
      intents: intents.length > 0 ? intents : [{ name: "other", proof: "" }],
      details: {
        package: pack,
        place,
        date,
        adults,
        children,
        name,
        pickup_city: pickup,
        room,
        pay_in_full: payInFull,
      },
      summary: withoutAmountsAndDates(form.summary).trim().slice(0, SUMMARY_MAX),
    },
    proofs,
    dropped,
  };
}
