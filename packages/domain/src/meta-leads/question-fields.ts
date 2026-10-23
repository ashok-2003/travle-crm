// What a form's questions hold (spec 3.4, M14): Meta's standard types matched for the person, custom questions guessed
// from their wording by the lead import's own guesser, and everything left going to the note. The checklist: a name, and a
// phone, an email or an Instagram handle.
import type { MetaFormQuestion, MetaQuestionType } from "@travel-crm/integrations/meta-graph";
import type { MetaQuestionField } from "@travel-crm/contracts/meta-leads";
import { guessFields } from "../imports/index.js";

export interface QuestionMatch {
  key: string;
  type: MetaQuestionType;
  label: string;
  field: MetaQuestionField | null;
  guessedBy: "standard" | "label" | null;
}

const standardField: Partial<Record<MetaQuestionType, MetaQuestionField>> = {
  full_name: "name",
  first_name: "name",
  last_name: "name",
  email: "email",
  phone: "phone",
  // City, state and ZIP are kept in the note as "From: Jaipur" (spec 3.4).
  city: "note",
  state: "note",
  zip: "note",
};

/** A lead import field that a guess may give a question: not the stage, which Meta never asks. */
const isQuestionField = (field: string | null): field is MetaQuestionField =>
  field !== null && field !== "stage" && field !== "username" && field !== "role";

/**
 * The default match for each question of a form, in its order. A field goes to one question only (the note and the name's
 * two halves excepted): a custom question whose guess is already taken goes to the note.
 */
export function defaultMatches(questions: readonly MetaFormQuestion[]): QuestionMatch[] {
  const taken = new Set<MetaQuestionField>();
  for (const question of questions) {
    const field = standardField[question.type];
    if (field !== undefined && field !== "note") taken.add(field);
  }
  const custom = questions.filter((question) => standardField[question.type] === undefined);
  const guesses = guessFields(
    "leads",
    custom.map((question) => question.label),
    new Map(),
    { wordsInHeader: true },
  );
  const guessOf = new Map(custom.map((question, index) => [question.key, guesses[index]] as const));
  return questions.map((question): QuestionMatch => {
    const base = { key: question.key, type: question.type, label: question.label };
    const standard = standardField[question.type];
    if (standard !== undefined) return { ...base, field: standard, guessedBy: "standard" };
    const guessed = guessOf.get(question.key)?.field ?? null;
    if (isQuestionField(guessed) && guessed !== "note" && !taken.has(guessed)) {
      taken.add(guessed);
      return { ...base, field: guessed, guessedBy: "label" };
    }
    // A custom question nobody could place goes to the note, in the form's order.
    return { ...base, field: "note", guessedBy: null };
  });
}

/** The checklist (spec 3.4): the person needs a name, and a phone, an email or an Instagram handle. */
export function checklistOf(matches: readonly Pick<QuestionMatch, "field">[]): {
  hasName: boolean;
  hasContact: boolean;
} {
  const fields = new Set(matches.map((match) => match.field));
  return {
    hasName: fields.has("name"),
    hasContact: fields.has("phone") || fields.has("email") || fields.has("instagram"),
  };
}
