// Page tokens at rest (M1): sealed with the SecretBox, bound to the organization and the Page's row so a ciphertext copied
// to another row fails to open. A token leaves this file only to be put in a Graph call's header.
import { SecretBoxError, type SecretBox } from "@travel-crm/integrations/secret-box";
import type { MetaPageRow } from "./page-row.js";

/** The associated data of a Page's token. */
export const tokenContext = (organizationId: string, pageRowId: string) => `meta-page:${organizationId}:${pageRowId}`;

export interface SealedColumns {
  tokenCiphertext: Uint8Array<ArrayBuffer>;
  tokenNonce: Uint8Array<ArrayBuffer>;
  tokenKeyVersion: number;
}

/** The three columns a sealed token is stored in. */
export function sealPageToken(box: SecretBox, token: string, organizationId: string, pageRowId: string): SealedColumns {
  const sealed = box.seal(token, tokenContext(organizationId, pageRowId));
  return {
    tokenCiphertext: new Uint8Array(sealed.ciphertext),
    tokenNonce: new Uint8Array(sealed.nonce),
    tokenKeyVersion: sealed.keyVersion,
  };
}

/** The Page's token, or null when none is kept or it will not open (the key was lost or the row was tampered with). */
export function openPageToken(
  box: SecretBox,
  page: Pick<MetaPageRow, "organizationId" | "id" | "tokenCiphertext" | "tokenNonce" | "tokenKeyVersion">,
): string | null {
  if (page.tokenCiphertext === null || page.tokenNonce === null || page.tokenKeyVersion === null) return null;
  try {
    return box.open(
      { ciphertext: page.tokenCiphertext, nonce: page.tokenNonce, keyVersion: page.tokenKeyVersion },
      tokenContext(page.organizationId, page.id),
    );
  } catch (error) {
    if (error instanceof SecretBoxError) return null;
    throw error;
  }
}

/** What clears a Page's token on disconnect. */
export const clearedToken = {
  tokenCiphertext: null,
  tokenNonce: null,
  tokenKeyVersion: null,
  tokenKind: null,
  tokenExpiresAt: null,
} as const;
