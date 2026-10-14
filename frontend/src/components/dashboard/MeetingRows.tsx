"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  formatDayLabel,
  formatDuration,
  formatTime,
  formatTimeRange,
  minutesBetween,
} from "@/lib/datetime";
import { formatMeetingCode } from "@/lib/meetingCode";
import { recapPath } from "@/lib/recap";
import type { Meeting } from "@/lib/types";

import { useDashboard } from "./DashboardProvider";
import { MeetingActionsMenu } from "./MeetingActionsMenu";

const ROW_CLASS = "flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-hover/70";

/** The thin bar at the start of a row: teal while live, indigo when planned, grey when over. */
const BAR_CLASS = "h-10 w-1 shrink-0 rounded-full";

/** A scheduled meeting that has not finished: time, topic, ID and "Start". */
export function UpcomingMeetingRow({ meeting }: { meeting: Meeting }) {
  const { startMeeting, isLaunching } = useDashboard();
  const isLive = meeting.status === "live";
  // Upcoming meetings are always scheduled ones, so both values are set.
  const start = new Date(meeting.scheduled_start ?? meeting.created_at);

  return (
    <li className={ROW_CLASS}>
      <span aria-hidden className={cn(BAR_CLASS, isLive ? "bg-accent" : "bg-brand")} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[12px] text-ink-muted">
          {formatTimeRange(start, meeting.duration_minutes ?? 0)}
          {isLive && <StatusChip tone="live">Live</StatusChip>}
        </p>
        <p className="truncate text-sm font-semibold">{meeting.title}</p>
        <p className="text-[12px] text-ink-muted">
          Meeting ID: {formatMeetingCode(meeting.code)}
          {meeting.agenda.length > 0 &&
            ` · ${meeting.agenda.length} agenda ${meeting.agenda.length === 1 ? "topic" : "topics"}`}
        </p>
      </div>
      <Button size="sm" disabled={isLaunching} onClick={() => startMeeting(meeting)}>
        {isLive ? "Rejoin" : "Start"}
      </Button>
      <MeetingActionsMenu meeting={meeting} />
    </li>
  );
}

/** A meeting from the past: when it happened and how long it ran. */
export function RecentMeetingRow({ meeting }: { meeting: Meeting }) {
  const { startMeeting, isLaunching } = useDashboard();
  const isLive = meeting.status === "live";
  const when = new Date(
    meeting.ended_at ?? meeting.started_at ?? meeting.scheduled_start ?? meeting.created_at,
  );

  return (
    <li className={ROW_CLASS}>
      <span aria-hidden className={cn(BAR_CLASS, isLive ? "bg-accent" : "bg-line")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{meeting.title}</p>
        <p className="truncate text-[12px] text-ink-muted">
          {formatDayLabel(when)}, {formatTime(when)}
          {" · "}
          {recentDuration(meeting)}
          {" · "}
          ID {formatMeetingCode(meeting.code)}
        </p>
      </div>
      {isLive ? (
        <Button size="sm" disabled={isLaunching} onClick={() => startMeeting(meeting)}>
          Rejoin
        </Button>
      ) : meeting.started_at ? (
        <Link
          href={recapPath(meeting.code)}
          aria-label={`Recap of ${meeting.title}`}
          className="inline-flex h-8 shrink-0 items-center rounded-lg border border-field bg-white px-3 text-[13px] font-medium text-ink hover:bg-hover"
        >
          Recap
        </Link>
      ) : (
        <StatusChip tone="neutral">Not started</StatusChip>
      )}
      <MeetingActionsMenu meeting={meeting} />
    </li>
  );
}

/** How long the meeting really ran, or its planned length if it never ended. */
function recentDuration(meeting: Meeting): string {
  if (meeting.status === "live") return "In progress";
  if (meeting.started_at && meeting.ended_at) {
    return formatDuration(minutesBetween(new Date(meeting.started_at), new Date(meeting.ended_at)));
  }
  return formatDuration(meeting.duration_minutes ?? 0);
}

function StatusChip({ tone, children }: { tone: "live" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        tone === "live" ? "bg-accent-soft text-accent-ink" : "bg-hover text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Split meetings into runs that fall on the same day: Today, Tomorrow... */
export function groupByDay(meetings: Meeting[]): Array<{ day: string; meetings: Meeting[] }> {
  const groups: Array<{ day: string; meetings: Meeting[] }> = [];
  for (const meeting of meetings) {
    const day = formatDayLabel(new Date(meeting.scheduled_start ?? meeting.created_at));
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.day === day) {
      lastGroup.meetings.push(meeting);
    } else {
      groups.push({ day, meetings: [meeting] });
    }
  }
  return groups;
}
