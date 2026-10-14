"use client";

import { useNow } from "@/hooks/useNow";
import { formatLongDateWithYear, formatTime, greeting } from "@/lib/datetime";

import { useDashboard } from "./DashboardProvider";

/** "Good morning, Alex" with today's date, and the current time on the right. */
export function HomeHeader() {
  const { user } = useDashboard();
  const now = useNow();
  const firstName = user?.name.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        {/* Fixed heights keep the layout still while the time and name load. */}
        <h2 className="h-8 truncate text-2xl leading-8 font-semibold tracking-tight text-navy">
          {now && `${greeting(now)}${firstName ? `, ${firstName}` : ""}`}
        </h2>
        <p className="mt-1 h-5 text-sm leading-5 text-ink-muted">{now && formatLongDateWithYear(now)}</p>
      </div>
      <p className="h-9 text-3xl leading-9 font-semibold tracking-tight text-navy tabular-nums">
        {now && formatTime(now)}
      </p>
    </div>
  );
}
