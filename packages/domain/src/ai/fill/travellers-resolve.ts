// From the model's reading of travellers to the proposal, by code: each person matched to a row, every date a full date, an age
// kept as an age, room words mapped to the fixed requests, a phone checked, and an ID read only as far as the rules allow: a
// passport's number, birth date, expiry and nationality come from its machine-readable lines when their check digits hold
// (else they stay empty and staff type them); any other ID gives name, birth date and gender, never a number. Without
// documents:view_sensitive no ID data is kept at all.
import { genders } from "@travel-crm/contracts/bookings";
import { toE164 } from "@travel-crm/contracts/kernel";
import {
  fillTraveller,
  fillValueSchemas,
  MAX_FILL_TRAVELLERS,
  type AiFillField,
  type FillTraveller,
} from "@travel-crm/contracts/ai";
import type { TravellersAnswer } from "@travel-crm/contracts/ai";
import type { RoomRequest } from "@travel-crm/contracts/departures";
import { resolveBirthDate, resolveFullDate } from "./full-date.js";
import { readMrz } from "./mrz.js";
import { matchRows, type RowToFill } from "./travellers-match.js";
import type { Resolved } from "./resolve.js";

/** The person's own words about their room as one of the fixed requests; unknown stays "none". */
export function roomRequestOf(words: string): RoomRequest {
  const text = words.toLowerCase();
  if (/ground[\s-]*floor|no stairs|can'?t climb|cannot climb|knee|wheelchair/.test(text)) return "ground_floor";
  if (/own room|single|alone|separate room|by (him|her|them)sel/.test(text)) return "single_room";
  if (/near (the )?group|close to (the )?group|next to (the )?group|with (the )?group/.test(text)) return "near_group";
  return "none";
}

const genderOf = (word: string | undefined): FillTraveller["gender"] => {
  const text = (word ?? "").toLowerCase().trim();
  const direct = genders.find((one) => one === text);
  if (direct !== undefined) return direct;
  if (/^(m|boy|son|husband|mr|mr\.|purush|ladka)$/.test(text)) return "male";
  if (/^(f|girl|daughter|wife|mrs|ms|mahila|ladki)$/.test(text)) return "female";
  return undefined;
};

export interface TravellersContext {
  today: string;
  rows: readonly RowToFill[];
  /** The member holds documents:view_sensitive: only then is anything of an ID kept. */
  mayReadIds: boolean;
  from: AiFillField["from"];
}

export function resolveTravellers(answer: TravellersAnswer, context: TravellersContext): Resolved {
  const questions: string[] = [];
  const ask = (question: string) => {
    if (!questions.includes(question)) questions.push(question);
  };
  const people = answer.people ?? [];
  const rowIds = matchRows(
    people.map((person) => person.name ?? ""),
    context.rows,
  );
  const out: FillTraveller[] = [];
  people.forEach((person, index) => {
    const saidName = person.name ?? "";
    const label = saidName === "" ? `Person ${String(index + 1)}` : saidName;
    const traveller: Record<string, unknown> = { saidName, travellerId: rowIds[index] ?? null };
    if (saidName !== "") traveller.name = saidName;
    const passport = person.idKind === "passport";
    let dateOfBirth = person.dateOfBirth === undefined ? null : resolveBirthDate(person.dateOfBirth, context.today);
    let sex = genderOf(person.gender);
    if (passport && context.mayReadIds) {
      const mrz = readMrz(person.mrzLine1 ?? "", person.mrzLine2 ?? "", context.today);
      if (mrz === null) {
        // Not trusted: the number, birth date, expiry and nationality stay empty, and staff type them.
        dateOfBirth = null;
        traveller.idNumberUnreadable = true;
        ask(`Couldn't read ${label}'s passport number: type it`);
      } else {
        dateOfBirth = mrz.dateOfBirth;
        sex ??= mrz.sex ?? undefined;
        if (saidName === "") traveller.name = `${mrz.givenNames} ${mrz.surname}`.trim();
        traveller.identity = {
          kind: "passport",
          number: mrz.number,
          issuedOn: person.issueDate === undefined ? null : resolveFullDate(person.issueDate),
          expiresOn: mrz.expiresOn,
          nationality: mrz.nationality,
        };
      }
    }
    if (dateOfBirth !== null) traveller.dateOfBirth = dateOfBirth;
    else if (person.age !== undefined && person.age >= 0 && person.age <= 120) {
      // An age alone never becomes a date of birth: the row stays incomplete and the sheet says so.
      traveller.ageOnly = person.age;
    } else if (person.dateOfBirth !== undefined && !(passport && context.mayReadIds)) {
      ask(`${label}: the date of birth wasn't a full date: ask for the day, month and year`);
    }
    if (sex !== undefined) traveller.gender = sex;
    for (const [key, value, question] of [
      ["phone", person.phone, `${label}'s phone number didn't look right`],
      ["emergencyPhone", person.emergencyPhone, `${label}'s emergency number didn't look right`],
    ] as const) {
      if (value === undefined) continue;
      const phone = toE164(value);
      if (phone === null) ask(question);
      else traveller[key] = phone;
    }
    if (person.emergencyName !== undefined) traveller.emergencyName = person.emergencyName;
    if (person.medicalNotes !== undefined) traveller.medicalNotes = person.medicalNotes;
    const roomWords = person.roomRequest ?? person.roomNote;
    if (roomWords !== undefined) {
      const request = roomRequestOf(`${person.roomRequest ?? ""} ${person.roomNote ?? ""}`);
      if (request !== "none") traveller.roomRequest = request;
      traveller.roomNote = (person.roomNote ?? roomWords).slice(0, 200);
    }
    const parsed = fillTraveller.safeParse(traveller);
    if (parsed.success && Object.keys(parsed.data).some((key) => !["saidName", "travellerId"].includes(key))) {
      out.push(parsed.data);
    }
  });
  const matched = out.filter((person) => person.travellerId !== null).length;
  if (out.length > matched) {
    ask(`There are ${String(context.rows.length)} rows; ${String(out.length)} people were named`);
  }
  const checked = fillValueSchemas.travellers.safeParse(out.slice(0, MAX_FILL_TRAVELLERS));
  return {
    fields: checked.success
      ? [{ path: "travellers", value: checked.data as AiFillField["value"], from: context.from, excerpt: "" }]
      : [],
    questions: questions.concat(answer.questions ?? []).slice(0, 5),
  };
}
