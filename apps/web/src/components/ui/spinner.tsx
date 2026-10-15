import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

// Decoration only: the app shows it inside busy buttons, whose own label says what is happening ("Signing in"). A
// role="status" with a label would join the button's name ("Loading Signing in"). A screen that loads shows a
// Skeleton with its own status instead.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" aria-hidden="true" className={cn("size-4 animate-spin", className)} {...props} />
  );
}

export { Spinner };
