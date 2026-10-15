"use client";

// Toasts (DESIGN.md section 6): bottom right on desktop, full width at the bottom on phones, the overlay shadow.
// The app has one light theme, so shadcn's next-themes lookup is left out. Errors stay until dismissed: callers pass
// { duration: Infinity } with toast.error.
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      duration={4000}
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast pr-12! shadow-md",
          // axe measures the button, not a pseudo-element, so it is a real 44px square (DESIGN.md section 4), moved
          // from sonner's 20px corner badge to the toast's right edge, with room left for the text.
          closeButton: "top-0! right-0! left-auto! size-11! transform-none! border-0! bg-transparent!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
