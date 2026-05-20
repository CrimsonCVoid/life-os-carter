import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Pick the inputMode iOS should surface when type isn't already enough.
// "decimal" gives the period; "numeric" gives the cleaner digit pad with no
// minus. We DON'T override an explicit inputMode passed in.
function pickInputMode(
  type: string,
  passed?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
): React.HTMLAttributes<HTMLInputElement>["inputMode"] {
  if (passed) return passed;
  if (type === "number") return "decimal";
  if (type === "email") return "email";
  if (type === "tel") return "tel";
  if (type === "url") return "url";
  if (type === "search") return "search";
  return undefined;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", inputMode, autoCapitalize, autoCorrect, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      inputMode={pickInputMode(type, inputMode)}
      // Sensible iOS defaults — most app inputs are NOT sentences; the user
      // can override via prop.
      autoCapitalize={autoCapitalize ?? (type === "email" || type === "url" || type === "password" ? "none" : "sentences")}
      autoCorrect={autoCorrect ?? (type === "email" || type === "url" || type === "password" ? "off" : undefined)}
      className={cn(
        "control flex h-11 w-full px-3.5 py-2",
        // 17px = iOS body size; prevents focus zoom (≥16px) and reads native.
        "text-[17px] leading-snug",
        "placeholder:text-[var(--color-fg-3)] outline-none accent-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
