// The words the form stores and the key's size: constants the visitor's page, the api and the ledger share.

/** The key of a form in its link: the organization's id (22 characters) and 16 random ones (ruling F12). */
export const FORM_KEY_LENGTH = 38;

/** The version of the "send me offers" sentence; the ledger keeps the text itself with it (W25). */
export const OFFERS_WORDING_VERSION = 1;

/** The longest wording the consent ledger holds (CHECK person_consent_wording_length). */
const MAX_WORDING_LENGTH = 300;

/** The tickbox's sentence, naming the agency. A very long name is cut so the sentence always fits the ledger. */
export function offersWording(agencyName: string): string {
  return `Send me travel offers and updates from ${agencyName.trim().slice(0, 200)}.`.slice(0, MAX_WORDING_LENGTH);
}
