import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

/** Primary is the one main action of a screen; secondary sits beside it. */
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-card hover:bg-brand-hover",
  secondary: "bg-brand-soft text-brand-ink hover:bg-[#e2e6fc]",
  outline: "border border-field bg-white text-ink hover:bg-hover",
  danger: "bg-danger text-white hover:bg-danger-hover",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 rounded-lg px-3 text-[13px]",
  md: "h-9 rounded-lg px-4 text-sm",
  lg: "h-11 rounded-xl px-5 text-[15px]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors",
        // A disabled button turns grey instead of fading its colour.
        "disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint disabled:shadow-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
