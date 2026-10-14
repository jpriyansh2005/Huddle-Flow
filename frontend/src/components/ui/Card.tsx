import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type CardProps = {
  title: string;
  /** id of the heading, so the section can be labelled by it. */
  titleId: string;
  /** A line under the title, e.g. the day being shown. */
  subtitle?: ReactNode;
  /** Buttons on the right of the header. */
  actions?: ReactNode;
  /** Content of the bottom strip, usually a "View all" link. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A white panel with a titled header: the building block of the dashboard. */
export function Card({
  title,
  titleId,
  subtitle,
  actions,
  footer,
  children,
  className,
}: CardProps) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex flex-col rounded-2xl border border-line bg-white shadow-card", className)}
    >
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-2.5">
        <div className="min-w-[9rem] flex-1">
          <h2 id={titleId} className="text-[15px] font-semibold text-navy">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 h-4 text-[12px] leading-4 text-ink-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {footer && <footer className="border-t border-line">{footer}</footer>}
    </section>
  );
}

/** The standard footer link of a card. */
export const CARD_FOOTER_LINK =
  "flex h-11 items-center justify-center gap-1 rounded-b-2xl text-[13px] font-medium text-brand hover:bg-brand-soft/60";
