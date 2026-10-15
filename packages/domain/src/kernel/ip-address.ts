// Network addresses, read the same way wherever one is kept or counted (share-link opens, rate limits).

/**
 * The eight 16-bit groups of a valid IPv6 address, with "::" expanded and a dotted IPv4 tail written as two groups.
 * Null for anything else, a zone id ("%eth0") included: the URL parser reads it, in its shortest form.
 */
export function ipv6Groups(address: string): number[] | null {
  let host: string;
  try {
    host = new URL(`http://[${address}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const groups = (part: string) => (part === "" ? [] : part.split(":").map((group) => Number.parseInt(group, 16)));
  const [head = "", tail] = host.split("::");
  if (tail === undefined) return groups(head);
  const left = groups(head);
  const right = groups(tail);
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}
