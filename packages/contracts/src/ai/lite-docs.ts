// The lite agent's words about itself: one line and an example for every intent and form field. The form's JSON schema
// and the Understand prompt both read these, so the model is told each thing once and the two never drift.
export interface FieldDoc {
  description: string;
  example: unknown;
}

/** Keyed by intent name; indexing it with a `LiteIntent` fails to compile when an intent has no entry. */
export const liteIntentDocs = {
  hello: { description: "Greets, or opens from an ad, and asks nothing else.", example: "Hi, I saw your ad" },
  package_question: {
    description: "Asks about a package: its days, what's included or not, pickup, what to carry.",
    example: "Is food included?",
  },
  price_question: { description: "Asks the price.", example: "How much for 3 people?" },
  dates_question: { description: "Asks the dates or the seats.", example: "When is the next batch?" },
  gives_details: {
    description: "Gives a detail: a trip or place, a date, how many, a name, a pickup city or a room.",
    example: "15 Dec, 3 adults",
  },
  wants_to_book: { description: "Wants to book, or asks how to pay.", example: "Book it, how do I pay?" },
  payment_sent: { description: "Says they paid, or sends the payment proof.", example: "Paid the advance" },
  payment_problem: {
    description: "A payment failed, or wants a refund or to cancel.",
    example: "Money got deducted but it failed",
  },
  agency_question: {
    description: "Asks about cancellation, refunds, ID documents, safety, children or ways to pay.",
    example: "Is it safe for solo women?",
  },
  discount: { description: "Asks for a discount or bargains.", example: "Any discount for 6 people?" },
  custom_trip: {
    description: "Wants a custom, private or changed trip.",
    example: "Can you plan a private trip for my family?",
  },
  complaint: { description: "Is unhappy, angry or complaining.", example: "Nobody replied for two days" },
  wants_person: { description: "Asks to talk to a person.", example: "Can I talk to someone?" },
  wants_call: { description: "Asks for a phone call.", example: "Please call me" },
  later: { description: "Will decide later.", example: "Will confirm next week" },
  not_interested: { description: "Is not interested.", example: "Not interested, thanks" },
  ok_thanks: { description: "Only says ok, thanks, or a thumbs up.", example: "Ok 👍" },
  asks_who_you_are: { description: "Asks who or what is answering.", example: "Are you a bot?" },
  other: { description: "None of these.", example: "Sending this to my wife" },
} as const satisfies Record<string, { description: string; example: string }>;

/** Every key path of the form the prompt lists, in the order it lists them. */
export const understandFieldDocs: Record<string, FieldDoc> = {
  intents: {
    description: "What the customer's newest messages want: one or two intents, the main one first.",
    example: [{ name: "price_question", proof: "how much for kedarnath" }],
  },
  "intents[].name": { description: "An intent from the list.", example: "price_question" },
  "intents[].proof / details.*.proof": {
    description: "The customer's exact words that show it, copied from one Customer line.",
    example: "how much for kedarnath",
  },
  "details.*.changed": { description: "True when this replaces something they said before.", example: false },
  "details.package": {
    description: "A package they picked or named, its name copied exactly from the package index.",
    example: { name: "Kedarnath Yatra 4N", proof: "the kedarnath one", changed: false },
  },
  "details.place": {
    description: "A place or trip they named that is not a package name, in their words.",
    example: { words: "Spiti", proof: "planning spiti valley", changed: false },
  },
  "details.date": {
    description: "When they want to go: `day` as YYYY-MM-DD, or only `month` as YYYY-MM.",
    example: { day: "2026-12-15", month: null, proof: "15 dec", changed: false },
  },
  "details.adults": {
    description: "How many adults travel.",
    example: { count: 3, proof: "we are 3", changed: false },
  },
  "details.children": {
    description: "How many children travel, and the ages they gave.",
    example: { count: 1, ages: [8], proof: "1 kid of 8", changed: false },
  },
  "details.name": {
    description: "Their name as they wrote it.",
    example: { full: "Riya Sharma", proof: "I am Riya Sharma" },
  },
  "details.pickup_city": {
    description: "The city they will join from.",
    example: { words: "Delhi", proof: "from delhi", changed: false },
  },
  "details.room": {
    description: "The room they want: single, double, triple or quad.",
    example: { type: "triple", proof: "triple sharing", changed: false },
  },
  "details.pay_in_full": {
    description: "They want to pay the whole amount now, not only the advance.",
    example: { proof: "I will pay full" },
  },
  open_to_other_trips: {
    description: "After we said we don't run a place: yes to see other trips, no if not, else unknown.",
    example: "unknown",
  },
  lookups: {
    description: "Up to 4 things to look up for the reply.",
    example: [{ tool: "dates_and_seats", words: null, package: "Kedarnath Yatra 4N", month: "2026-12", topic: null }],
  },
  "lookups[].tool": {
    description: "find_packages, package_details, dates_and_seats, price or agency_answer.",
    example: "package_details",
  },
  "lookups[].words": { description: "For find_packages: the place or name to search for.", example: "kedarnath" },
  "lookups[].package": {
    description: "For package_details, dates_and_seats and price: a package name from the index.",
    example: "Kedarnath Yatra 4N",
  },
  "lookups[].month": {
    description: "For dates_and_seats: YYYY-MM, or null for the next dates.",
    example: "2026-12",
  },
  "lookups[].topic": {
    description: "For agency_answer: cancellation, refunds, id_documents, safety, children or payment_methods.",
    example: "refunds",
  },
  language: { description: "The language and script they write in.", example: "hinglish" },
  summary: {
    description:
      "Your notes on this customer, rewritten: short lines, no prices, dates or seat counts, at most 800 characters.",
    example: "Family trip, wants Kedarnath; worried about the cold; brochure sent.",
  },
  "score.chance": { description: "How likely they book in the next two weeks, 0 to 100.", example: 60 },
  "score.label": { description: "hot, warm or cold.", example: "warm" },
  "score.reasons": { description: "Up to 3 short reasons for the chance.", example: ["Gave a date and a group size"] },
  "score.looks_fake": { description: "True for spam, a test or a wrong number.", example: false },
  "score.fake_why": { description: "Why it looks fake; empty when it doesn't.", example: "" },
  "score.standing": {
    description: "One line on how the sale stands.",
    example: "Has the price; choosing between two dates.",
  },
  "score.next_step": { description: "What the team should do next.", example: "Send the December dates." },
};

/**
 * The parts inside a documented field, and the two groups, that the schema explains to the model but the prompt's list
 * leaves out (their meaning is in the line above them).
 */
export const understandPartDocs: Record<string, FieldDoc> = {
  details: {
    description: "What they said about the trip, from the whole chat.",
    example: { adults: null, place: null },
  },
  score: { description: "How the sale looks to the team.", example: { chance: 60, label: "warm" } },
  "details.package.name": {
    description: "The package name, copied exactly from the index.",
    example: "Kedarnath Yatra 4N",
  },
  "details.place.words": { description: "The place, in their words.", example: "Spiti" },
  "details.date.day": { description: "The exact day, YYYY-MM-DD, or null.", example: "2026-12-15" },
  "details.date.month": { description: "Only the month, YYYY-MM, or null.", example: "2026-12" },
  "details.adults.count": { description: "The number of adults.", example: 3 },
  "details.children.count": { description: "The number of children.", example: 1 },
  "details.children.ages": { description: "The ages they gave, in years.", example: [8] },
  "details.name.full": { description: "The name as they wrote it.", example: "Riya Sharma" },
  "details.pickup_city.words": { description: "The city, in their words.", example: "Delhi" },
  "details.room.type": { description: "single, double, triple or quad.", example: "triple" },
};
