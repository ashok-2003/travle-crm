// The confirmation code of Meta's data-deletion callback: 32 base64url characters, made by the api from the user's id and the
// request's time. The deletion is done before the callback answers, so the shape is all the status page can check.
export function metaDeletionCodeIsWellFormed(code: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(code);
}
