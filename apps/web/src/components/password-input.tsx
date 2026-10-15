"use client";

// A password input with a show/hide button: the registry's InputGroup around an InputGroupInput, and an
// InputGroupButton with an eye. Showing changes only the input's type: what was typed, the autocomplete hint and the
// form's bindings stay, and a click on the button leaves the focus in the input, so typing carries on.
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

export function PasswordInput(props: ComponentProps<"input">) {
  const t = useTranslations("common");
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput {...props} type={shown ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-pressed={shown}
          aria-label={shown ? t("hidePassword") : t("showPassword")}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            setShown(!shown);
          }}
        >
          {shown ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
