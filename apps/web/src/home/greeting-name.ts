// The name Home greets a person by: their first name, not their title ("Mr. Anish Sharma" is greeted as Anish).
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "smt", "kumari"]);

export function greetingName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const named = parts.find((part) => !TITLES.has(part.replace(/\.$/, "").toLowerCase()));
  return named ?? parts[0] ?? fullName;
}
