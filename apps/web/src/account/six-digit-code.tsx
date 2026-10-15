"use client";

// The 6-digit code from an authenticator app, one box per digit, as both the sign-in code step and two-factor setup
// ask for it. The phone offers a code it received (one-time-code) and opens the number pad.
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const CODE_LENGTH = 6;

export function SixDigitCode({
  id,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <InputOTP
      id={id}
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
