import { cn } from "@/lib/cn";

/**
 * The HuddleFlow mark: two people (an indigo-white and a teal head) above a
 * flowing line, on an indigo rounded square. Drawn in SVG so it stays sharp
 * at any size and needs no image file. app/icon.svg is the same drawing.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="HuddleFlow"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="#3b4fe0" />
      <circle cx="12" cy="12.5" r="3.4" fill="#ffffff" />
      <circle cx="20.5" cy="12.5" r="3.4" fill="#5eead4" />
      <path
        d="M7.5 21.5c2.8-3 5.4-3 8.2-.4s5.6 2.6 8.8-.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LogoProps = {
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
  /** "dark" is navy text for light backgrounds, "light" is white text. */
  tone?: "dark" | "light";
  className?: string;
};

/** The mark followed by the "HuddleFlow" wordmark. */
export function Logo({ size = 30, tone = "dark", className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          "leading-none font-bold tracking-tight",
          tone === "dark" ? "text-navy" : "text-white",
        )}
        style={{ fontSize: size * 0.62 }}
      >
        Huddle<span className={tone === "dark" ? "text-brand" : "text-[#9fb0ff]"}>Flow</span>
      </span>
    </span>
  );
}
