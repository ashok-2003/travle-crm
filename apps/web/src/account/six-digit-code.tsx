"use client";

// The 6-digit code from an authenticator app, one box per digit, as both the sign-in code step and two-factor setup
// ask for it. The phone offers a code it received (one-time-code) and opens the number pad.
import type { FieldLinks } from "@/components/form-field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const CODE_LENGTH = 6;

export function SixDigitCode({
  links,
  value,
  onChange,
  autoFocus = false,
}: {
  /** The id, invalid state and description FormField gives, so the boxes carry the error. */
  links: FieldLinks;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <InputOTP
      {...links}
      maxLength={CODE_LENGTH}
      value={value}
      onChange={onChange}
      inputMode="numeric"
      pattern="^[0-9]+$"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
    >
      <InputOTPGroup className="numbers">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <InputOTPSlot key={index} index={index} className="size-11 text-number-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
