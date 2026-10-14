import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";

/** Grey placeholder rows shown while a list is loading. */
export function ListSkeleton({
  rows = 3,
  label = "Loading meetings",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <ul aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="animate-pulse space-y-2 px-5 py-3">
          <div className="h-3 w-28 rounded bg-line" />
          <div className="h-4 w-48 rounded bg-line" />
          <div className="h-3 w-36 rounded bg-line" />
        </li>
      ))}
    </ul>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  hint?: string;
};

export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icon size={22} />
      </span>
      <p className="text-[13px] font-semibold">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <p className="text-sm text-ink-muted">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
        Try again
      </Button>
    </div>
  );
}
