// The demo agency's sample data (spec 7): its six destinations, eleven people and thirteen leads, each lead timed from
// the reset's `now` on the agency's clock. Every stage is here; Priya Nair returns after a Won trip to Kerala, Arjun
// Reddy after a Lost one, and the Quick Loans Desk is Not a lead with its phone blocked. Notes on four leads;
// follow-ups two overdue, three due today, two later. demo-leads.ts builds them.
import type { LeadSource, LeadStage, TripInput } from "@travel-crm/contracts/crm";
import { addDays, calendarDateIn, instantAt, parseTimeOfDay, startOfDayIn } from "../kernel/index.js";

export const DESTINATIONS = ["Kashmir", "Goa", "Kerala", "Manali", "Andaman", "Rajasthan"] as const;
type DemoDestination = (typeof DESTINATIONS)[number];

export const PEOPLE = [
  { name: "Rahul Sharma", phone: "+919811023402" },
  { name: "Kavya Menon", email: "kavya.menon@example.com" },
  { name: "Sneha Patel", phone: "+919825034503", instagramHandle: "sneha.travels" },
  { name: "Vikram Singh", phone: "+919810056705" },
  { name: "Priya Nair", phone: "+919845012301", email: "priya.nair@example.com" },
  { name: "Ananya Iyer", phone: "+919840067806" },
  { name: "Rohan Gupta", phone: "+919820078907" },
  { name: "Arjun Reddy", phone: "+919849045604" },
  { name: "Meera Joshi", instagramHandle: "meera.wanders" },
  { name: "Farhan Qureshi", phone: "+919830089008" },
  { name: "Quick Loans Desk", phone: "+919999012345" },
] as const;
type DemoPerson = (typeof PEOPLE)[number]["name"];

export interface DemoLead {
  person: DemoPerson;
  owner: "owner" | "sales";
  stage: LeadStage;
  destination: DemoDestination | null;
  trip: Partial<Omit<TripInput, "destination">>;
  source: LeadSource;
  sourceDetail?: string;
  createdAt: Date;
  note?: string;
  followUp?: { title: string; dueAt: Date };
  returning?: boolean;
}

const rupees = (amount: number, basis: "per_person" | "for_everyone") => ({
  amount: { amountPaise: amount * 100, currency: "INR" as const },
  basis,
});

/** The thirteen leads, each timed from now on the agency's clock. */
export function demoLeads(now: Date, timeZone: string): DemoLead[] {
  const today = calendarDateIn(now, timeZone);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const daysAgo = (days: number) => ago(days * 24 * 60);
  const at = (days: number, time: string) => instantAt(addDays(today, days), parseTimeOfDay(time), timeZone);
  // Due today: spread between now and the agency's midnight, whatever hour the demo is built, on the minute unless the
  // minute is already past (a reset in the day's last minute keeps the exact instant, still today).
  const endsAt = startOfDayIn(addDays(today, 1), timeZone).getTime();
  const laterToday = (part: number) => {
    const exact = now.getTime() + (endsAt - now.getTime()) * part;
    const onTheMinute = Math.floor(exact / 60_000) * 60_000;
    return new Date(onTheMinute > now.getTime() ? onTheMinute : exact);
  };
  const dates = (from: number, nights: number) =>
    ({ kind: "dates", from: addDays(today, from), to: addDays(today, from + nights) }) as const;
  const month = (inDays: number) => ({ kind: "month", month: addDays(today, inDays).slice(0, 7) }) as const;
  return [
    {
      person: "Priya Nair",
      owner: "sales",
      stage: "won",
      destination: "Kerala",
      trip: { when: dates(-330, 5), adults: 2, childrenAges: [9], tripType: "family", hotelCategory: "4_star" },
      source: "referral",
      createdAt: daysAgo(345),
    },
    {
      person: "Arjun Reddy",
      owner: "sales",
      stage: "lost",
      destination: "Goa",
      trip: { when: month(-60), adults: 4, tripType: "friends" },
      source: "instagram",
      createdAt: daysAgo(95),
    },
    {
      person: "Meera Joshi",
      owner: "owner",
      stage: "lost",
      destination: "Manali",
      trip: { when: { kind: "flexible" }, adults: 1, tripType: "solo" },
      source: "instagram",
      createdAt: daysAgo(25),
      note: "Went with a cheaper operator; try her again for the spring treks.",
    },
    {
      person: "Rohan Gupta",
      owner: "owner",
      stage: "won",
      destination: "Goa",
      trip: {
        when: dates(14, 4),
        adults: 6,
        tripType: "friends",
        hotelCategory: "3_star",
        budget: rupees(18_000, "per_person"),
      },
      source: "phone_call",
      createdAt: daysAgo(20),
      followUp: { title: "Share the hotel vouchers", dueAt: at(3, "11:30") },
    },
    {
      person: "Ananya Iyer",
      owner: "owner",
      stage: "booking_requested",
      destination: "Andaman",
      trip: {
        when: dates(40, 6),
        adults: 2,
        tripType: "honeymoon",
        hotelCategory: "5_star",
        budget: rupees(2_50_000, "for_everyone"),
      },
      source: "website",
      createdAt: daysAgo(9),
      followUp: { title: "Confirm the Havelock resort", dueAt: laterToday(0.3) },
    },
    {
      person: "Priya Nair",
      owner: "sales",
      stage: "quote_sent",
      destination: "Kashmir",
      trip: {
        when: dates(50, 6),
        adults: 2,
        budget: rupees(60_000, "per_person"),
        departureCity: "Kochi",
        food: "veg",
      },
      source: "referral",
      sourceDetail: "Came back after her Kerala trip",
      createdAt: daysAgo(6),
      returning: true,
      note: "Wants Gulmarg and a houseboat night in Srinagar.",
      followUp: { title: "Call about the Kashmir quote", dueAt: laterToday(0.5) },
    },
    {
      person: "Vikram Singh",
      owner: "owner",
      stage: "contacted",
      destination: "Rajasthan",
      trip: { when: month(75), adults: 2, childrenAges: [10, 6], tripType: "family", departureCity: "Delhi" },
      source: "walk_in",
      createdAt: daysAgo(5),
      followUp: { title: "Send the Jaipur and Udaipur plan", dueAt: laterToday(0.7) },
    },
    {
      person: "Farhan Qureshi",
      owner: "owner",
      stage: "quote_sent",
      destination: "Kerala",
      trip: {
        when: month(45),
        adults: 2,
        childrenAges: [4],
        tripType: "family",
        budget: rupees(35_000, "per_person"),
        food: "non_veg",
      },
      source: "facebook",
      createdAt: daysAgo(4),
      note: "Prefers Munnar over Alleppey.",
      followUp: { title: "Follow up on the Kerala quote", dueAt: at(1, "10:00") },
    },
    {
      person: "Sneha Patel",
      owner: "sales",
      stage: "contacted",
      destination: "Manali",
      trip: {
        when: dates(35, 6),
        adults: 2,
        tripType: "honeymoon",
        budget: rupees(1_20_000, "for_everyone"),
        hotelCategory: "4_star",
      },
      source: "instagram",
      createdAt: daysAgo(3),
      followUp: { title: "Send the Manali honeymoon options", dueAt: at(-1, "17:00") },
    },
    {
      person: "Arjun Reddy",
      owner: "sales",
      stage: "contacted",
      destination: "Andaman",
      trip: { when: month(90), adults: 3, tripType: "friends" },
      source: "phone_call",
      createdAt: daysAgo(2),
      returning: true,
      followUp: { title: "Call back after 4 pm", dueAt: ago(180) },
    },
    {
      person: "Quick Loans Desk",
      owner: "sales",
      stage: "not_a_lead",
      destination: null,
      trip: {},
      source: "phone_call",
      createdAt: daysAgo(1),
    },
    {
      person: "Kavya Menon",
      owner: "owner",
      stage: "new",
      destination: "Goa",
      trip: { when: { kind: "flexible" }, adults: 4, tripType: "friends" },
      source: "website",
      createdAt: ago(120),
    },
    {
      person: "Rahul Sharma",
      owner: "sales",
      stage: "new",
      destination: "Kashmir",
      trip: {
        when: month(60),
        adults: 2,
        childrenAges: [7],
        budget: rupees(45_000, "per_person"),
        departureCity: "Mumbai",
      },
      source: "phone_call",
      createdAt: ago(12),
      note: "Wants a houseboat stay in Srinagar.",
    },
  ];
}
