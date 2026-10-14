import { cn } from "@/lib/cn";
import { avatarColor, initials } from "@/lib/person";

type AvatarProps = {
  name: string;
  /** Width and height in pixels. */
  size?: number;
  /** A circle (profile pictures) or a rounded square (people lists). */
  shape?: "circle" | "rounded";
  className?: string;
};

/** A person without a photo, shown as their initials on a coloured background. */
export function Avatar({ name, size = 36, shape = "rounded", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold text-white select-none",
        shape === "circle" ? "rounded-full" : "rounded-[28%]",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: avatarColor(name),
      }}
    >
      {initials(name)}
    </span>
  );
}
