// What is kept about someone who opens a share link: their network, not their exact address (less personal data,
// still enough to tell one place from another), and a shortened User-Agent.
import { isIPv4, isIPv6 } from "node:net";

const MAX_USER_AGENT_LENGTH = 300;

/** The eight 16-bit groups of a valid IPv6 address, expanding "::" and a trailing IPv4 part. */
function ipv6Groups(address: string): string[] {
  const toGroups = (part: string): string[] =>
    part === ""
      ? []
      : part.split(":").flatMap((group) => {
          if (!group.includes(".")) return [group];
          const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
          return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
        });
  const [head = "", tail] = address.split("::");
  const headGroups = toGroups(head);
  if (tail === undefined) return headGroups;
  const tailGroups = toGroups(tail);
  return [...headGroups, ...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups];
}

/** An IPv4 address cut to its /24 ("203.0.113.0"), an IPv6 one to its /48 ("2001:db8:85a3::"), anything else null. */
export function truncateIpAddress(address: string | null): string | null {
  if (address === null) return null;
  const trimmed = address.trim();
  const ipv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)?.[1] ?? trimmed;
  if (isIPv4(ipv4)) return `${ipv4.split(".").slice(0, 3).join(".")}.0`;
  const withoutZone = trimmed.split("%")[0] ?? "";
  if (!isIPv6(withoutZone)) return null;
  const network = ipv6Groups(withoutZone)
    .slice(0, 3)
    .map((group) => Number.parseInt(group, 16).toString(16));
  return `${network.join(":")}::`;
}

/** The User-Agent cut to 300 characters, whole characters only. */
export function shortenUserAgent(userAgent: string | null): string | null {
  if (userAgent === null || userAgent === "") return null;
  return Array.from(userAgent).slice(0, MAX_USER_AGENT_LENGTH).join("");
}
