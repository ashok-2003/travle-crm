// The time zones an organization can be put in, as canonical IANA names (the contract keeps a zone as entered, and
// relies on this list for spelling). India's first: the product sells in India in Phase 1, and these are the zones of
// its neighbours and of the places Indian agencies most often keep an office.
export const timeZones = [
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Colombo",
  "Asia/Dhaka",
  "Asia/Thimphu",
  "Indian/Maldives",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "UTC",
] as const;

export type ListedTimeZone = (typeof timeZones)[number];

export function isListedTimeZone(zone: string): zone is ListedTimeZone {
  return (timeZones as readonly string[]).includes(zone);
}
