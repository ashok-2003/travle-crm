// What is kept about someone who opens a share link: their network, not their exact address (less personal data,
// still enough to tell one place from another), and a shortened User-Agent.
import { isIPv4 } from "node:net";
import { ipv6Groups } from "../kernel/index.js";

const MAX_USER_AGENT_LENGTH = 300;

/** An IPv4 address cut to its /24 ("203.0.113.0"), an IPv6 one to its /48 ("2001:db8:85a3::"), anything else null. */
export function truncateIpAddress(address: string | null): string | null {
  if (address === null) return null;
  const trimmed = address.trim();
  const ipv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)?.[1] ?? trimmed;
  if (isIPv4(ipv4)) return `${ipv4.split(".").slice(0, 3).join(".")}.0`;
  const groups = ipv6Groups(trimmed.split("%")[0] ?? "");
  if (groups?.length !== 8) return null;
  return `${groups
    .slice(0, 3)
    .map((group) => group.toString(16))
    .join(":")}::`;
}

/** The User-Agent cut to 300 characters, whole characters only. */
export function shortenUserAgent(userAgent: string | null): string | null {
  if (userAgent === null || userAgent === "") return null;
  return Array.from(userAgent).slice(0, MAX_USER_AGENT_LENGTH).join("");
}
