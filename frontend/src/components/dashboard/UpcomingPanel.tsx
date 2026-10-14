"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Card, CARD_FOOTER_LINK } from "@/components/ui/Card";
import { useNow } from "@/hooks/useNow";
import { addDays, formatAgendaDate, startOfDay } from "@/lib/datetime";

import { useDashboard } from "./DashboardProvider";
import { ErrorState, ListSkeleton } from "./ListStates";
import { groupByDay, UpcomingMeetingRow } from "./MeetingRows";

/** How many meetings the home screen shows before linking to the full list. */
const HOME_LIMIT = 4;

const ICON_BUTTON =
  "flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent";

/**
 * Upcoming meetings as an agenda that starts on the selected day. The arrows
 * move that day forwards and back; "Today" returns to today.
 */
export function UpcomingPanel() {
  const { upcoming, loading, error, reload, openScheduleDialog } = useDashboard();
  const now = useNow(60_000);
  // How many days after today the agenda starts.
  const [dayOffset, setDayOffset] = useState(0);

  const firstDay = now ? addDays(startOfDay(now), dayOffset) : null;
  // Today's agenda also keeps a meeting that started earlier and is still running.
  const fromDay =
    firstDay && dayOffset > 0
      ? upcoming.filter((meeting) => new Date(meeting.scheduled_start ?? 0) >= firstDay)
      : upcoming;
  const shown = fromDay.slice(0, HOME_LIMIT);

  return (
    <Card
      title="Upcoming meetings"
      titleId="upcoming-heading"
      subtitle={firstDay && now && `From ${formatAgendaDate(firstDay, now)}`}
      actions={
        <>
          <button
            type="button"
            onClick={() => setDayOffset(0)}
            className="mr-1 h-8 rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-hover"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Previous day"
            disabled={dayOffset === 0}
            onClick={() => setDayOffset((offset) => offset - 1)}
            className={ICON_BUTTON}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setDayOffset((offset) => offset + 1)}
            className={ICON_BUTTON}
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            aria-label="Schedule a meeting"
            onClick={() => openScheduleDialog()}
            className={ICON_BUTTON}
          >
            <Plus size={17} />
          </button>
        </>
      }
      footer={
        <Link href="/meetings" className={CARD_FOOTER_LINK}>
          {fromDay.length > HOME_LIMIT ? `View all ${fromDay.length} meetings` : "Open meetings"}
          <ChevronRight size={14} />
        </Link>
      }
    >
      <div className="min-h-[240px]">
        {error && upcoming.length === 0 ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && upcoming.length === 0 ? (
          <ListSkeleton />
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-10 pb-10 text-center">
            <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <CalendarDays size={26} strokeWidth={1.6} />
            </span>
            <p className="text-sm font-medium text-ink">No meetings scheduled</p>
            <p className="mt-1 text-[13px] text-ink-muted">Plan one ahead and it will show up here.</p>
            <button
              type="button"
              onClick={() => openScheduleDialog()}
              className="mt-3 flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
            >
              <Plus size={14} />
              Schedule a meeting
            </button>
          </div>
        ) : (
          <div className="py-1.5">
            {groupByDay(shown).map((group) => (
              <div key={group.day}>
                <h3 className="px-5 pt-3 pb-1 text-[12px] font-medium text-ink-muted">{group.day}</h3>
                <ul>
                  {group.meetings.map((meeting) => (
                    <UpcomingMeetingRow key={meeting.id} meeting={meeting} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
