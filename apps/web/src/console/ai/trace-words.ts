// The words a turn's figures read as, shared by the list and the turn's page.
import { useTranslations } from "next-intl";
import { formatCount } from "@/lib/format";
import { rupeesOf } from "../growth/usage-screen";

export function useTraceWords() {
  const t = useTranslations("consoleAi.traces");
  return {
    kind: (kind: "reply" | "nudge") => t(`kinds.${kind}`),
    tokens: (input: number, output: number) => t("tokens", { input: formatCount(input), output: formatCount(output) }),
    duration: (ms: number) => t("duration", { seconds: (ms / 1000).toFixed(1) }),
    cost: (paise: number) => rupeesOf(paise),
    /** Only the id's last six characters: a customer's name or number never shows here. */
    chat: (conversationId: string) => t("chat", { code: conversationId.slice(-6) }),
  };
}
