// The SecretBox port (ADR 0034): seals a secret (a Meta Page token) for storage and opens it again, bound to a context.

/** A sealed secret as stored: the ciphertext with its tag, the nonce, and which key sealed it. */
export interface SealedSecret {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  /** Names the key that sealed it (a digest of the key, not its place in the list), so the list can be reordered. */
  keyVersion: number;
}

export const secretBoxErrorReasons = ["bad_key", "cannot_open"] as const;
export type SecretBoxErrorReason = (typeof secretBoxErrorReasons)[number];

/** A key was malformed or a value would not open. The message is the reason only: never a key or a secret. */
export class SecretBoxError extends Error {
  readonly reason: SecretBoxErrorReason;

  constructor(reason: SecretBoxErrorReason) {
    super(`Secret box: ${reason}`);
    this.name = "SecretBoxError";
    this.reason = reason;
  }
}

export interface SecretBox {
  /**
   * Seals `secret` with the newest key. `context` (the Page and organization ids) is authenticated, not stored: a
   * ciphertext copied to another row fails to open.
   */
  seal(secret: string, context: string): SealedSecret;
  /** Throws SecretBoxError("cannot_open") for a wrong context, an unknown key, or a ciphertext that was altered. */
  open(sealed: SealedSecret, context: string): string;
}
