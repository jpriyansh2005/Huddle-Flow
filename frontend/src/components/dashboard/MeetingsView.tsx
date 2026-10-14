"use client";

import { CalendarDays, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

import { useDashboard } from "./DashboardProvider";
import { EmptyState, ErrorState, ListSkeleton } from "./ListStates";
import { groupByDay, UpcomingMeetingRow } from "./MeetingRows";
import { RecentMeetings } from "./RecentMeetings";

type TabId = "upcoming" | "previous";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "previous", label: "Previous" },
];

/** The Meetings tab: every upcoming and previous meeting, with actions. */
export function MeetingsView() {
  const { upcoming, recent, loading, error, reload, openScheduleDialog } = useDashboard();
  const router = useRouter();
  // The selected tab lives in the URL (?tab=previous) so it can be linked to
  // and survives a refresh.
  const activeTab: TabId = useSearchParams().get("tab") === "previous" ? "previous" : "upcoming";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Meetings" className="flex rounded-xl bg-[#e9edf5] p-1">
          {TABS.map((tab) => {
            const count = tab.id === "upcoming" ? upcoming.length : recent.length;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => router.replace(tab.id === "upcoming" ? "/meetings" : "/meetings?tab=previous")}
                className={cn(
                  "h-8 rounded-lg px-4 text-sm font-medium transition-colors",
                  activeTab === tab.id ? "bg-white text-navy shadow-card" : "text-ink-muted hover:text-ink",
                )}
              >
                {tab.label}
                {!loading && <span className="ml-1.5 text-ink-faint">{count}</span>}
              </button>
            );
          })}
        </div>
        <Button onClick={() => openScheduleDialog()}>
          <Plus size={16} strokeWidth={2.5} />
          Schedule a meeting
        </Button>
      </div>

      <section className="rounded-2xl border border-line bg-white shadow-card">
        {activeTab === "previous" ? (
          <RecentMeetings />
        ) : error && upcoming.length === 0 ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && upcoming.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming meetings"
            hint="Schedule a meeting and it will show up here."
          />
        ) : (
          <div className="py-2">
            {groupByDay(upcoming).map((group) => (
              <div key={group.day}>
                <h2 className="px-5 pt-3 pb-1 text-[12px] font-medium text-ink-muted">
                  {group.day}
                </h2>
                <ul>
                  {group.meetings.map((meeting) => (
                    <UpcomingMeetingRow key={meeting.id} meeting={meeting} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
