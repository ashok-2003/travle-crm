// The person a chat is with, as an act reads them for the lead (the one agent's act keeps this lite shape).

export interface ChatPerson {
  personId: string | null;
  phoneE164: string;
  profileName: string | null;
}
