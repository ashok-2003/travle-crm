// Notifications belong to people: the bell, opt-outs and push subscriptions are always the acting person's own.
import { DomainError, type Actor } from "../kernel/index.js";

/** An actor who is a signed-in person, as the bell's functions need. MemberAccess is one. */
export type Person = Actor & { readonly userId: string };

/** The actor as a person. A job, which acts for nobody, has no bell. */
export function asPerson(actor: Actor): Person {
  const { userId } = actor;
  if (userId === null) {
    throw new DomainError("FORBIDDEN", "NOT_A_PERSON", "Only a signed-in person has notifications");
  }
  return { ...actor, userId };
}
