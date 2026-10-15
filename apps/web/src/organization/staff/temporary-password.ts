// Temporary passwords for new staff and resets: 12 characters an admin can read out over the phone, so no 0/O, 1/l/I.
// They only have to last until the person signs in and chooses their own.
const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random bytes past this would favour the first letters of the alphabet, so they are drawn again. */
const fairLimit = 256 - (256 % alphabet.length);

export function temporaryPassword(length = 12): string {
  let password = "";
  while (password.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < fairLimit && password.length < length) password += alphabet.charAt(byte % alphabet.length);
    }
  }
  return password;
}
