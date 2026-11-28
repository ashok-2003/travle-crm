"use client";

// A list's search box (spec 3.3, R5; the Leads list's first, now every list's), sent once typing pauses. The box is named
// for screen readers; its placeholder says what it takes, in the list's own words. It keeps its own text while the
// person types; the list remounts it to empty it (Clear filters).
import { SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

export function SearchField({
  initial,
  onSearch,
  label,
  placeholder,
  className,
}: {
  initial: string;
  onSearch: (text: string) => void;
  /** Its name for screen readers, and what its placeholder says it takes. */
  label: string;
  placeholder: string;
  className?: string;
}) {
  const [text, setText] = useState(initial);
  const settled = useDebouncedValue(text);
  const sent = useRef(settled);
  useEffect(() => {
    if (settled === sent.current) return;
    sent.current = settled;
    onSearch(settled.trim());
  }, [settled, onSearch]);
  return (
    <InputGroup className={cn("md:w-80", className)}>
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
    </InputGroup>
  );
}
