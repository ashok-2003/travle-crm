"use client";

// The lead list's search (spec 3.3, R5): a name, forgiving of typos, or four or more digits of a phone, sent once
// typing pauses. The box is named for screen readers; its placeholder says what it takes. It keeps its own text while
// the person types; the list remounts it to empty it (Clear filters).
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export function SearchField({ initial, onSearch }: { initial: string; onSearch: (text: string) => void }) {
  const t = useTranslations("leads.list");
  const [text, setText] = useState(initial);
  const settled = useDebouncedValue(text);
  const sent = useRef(settled);
  useEffect(() => {
    if (settled === sent.current) return;
    sent.current = settled;
    onSearch(settled.trim());
  }, [settled, onSearch]);
  return (
    <InputGroup className="md:w-80">
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={t("search")}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
    </InputGroup>
  );
}
