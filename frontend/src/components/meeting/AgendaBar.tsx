"use client";

import { Check, ChevronLeft, ListChecks, Play, SkipForward } from "lucide-react";

import { useNow } from "@/hooks/useNow";
import { agendaProgress, formatCountdown, itemTiming, totalMinutes } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import type { AgendaItem } from "@/lib/types";

type AgendaBarProps = {
  agenda: AgendaItem[];
  clockOffsetMs: number;
  isHost: boolean;
  onNext: () => void;
  onBack: () => void;
  onOpenAgenda: () => void;
};

const TONE_CLASSES = {
  ok: "bg-room-control text-room-text",
  warn: "bg-warning/20 text-warning",
  over: "bg-room-red/20 text-room-red",
};
const BAR_TONE_CLASSES = { ok: "bg-accent", warn: "bg-warning", over: "bg-room-red" };
const HOST_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors";

/**
 * The strip under the meeting header: the topic being discussed and its
 * countdown, the same for everyone. The host moves the agenda on from here.
 */
export function AgendaBar({
  agenda,
  clockOffsetMs,
  isHost,
  onNext,
  onBack,
  onOpenAgenda,
}: AgendaBarProps) {
  const now = useNow();
  const progress = agendaProgress(agenda);
  if (progress.phase === "empty" || !now) return null;
  const serverNow = now.getTime() + clockOffsetMs;

  return (
    <div className="mx-2 flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-room-tile px-3 py-2 text-room-text">
      <button
        type="button"
        onClick={onOpenAgenda}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left"
        aria-label="Open the agenda"
      >
        <ListChecks size={18} className="shrink-0 text-room-faint" />
        {progress.phase === "not-started" && (
          <span className="truncate text-sm text-room-muted">
            Agenda: {agenda.length} {agenda.length === 1 ? "topic" : "topics"},{" "}
            {totalMinutes(agenda)} min planned
          </span>
        )}
        {progress.phase === "finished" && (
          <span className="flex items-center gap-1.5 text-sm text-room-green">
            <Check size={16} />
            Agenda complete
          </span>
        )}
        {progress.phase === "running" && (
          <RunningItem
            item={progress.item}
            index={progress.index}
            count={agenda.length}
            serverNow={serverNow}
          />
        )}
      </button>

      {isHost && (
        <div className="flex shrink-0 items-center gap-1.5">
          {progress.phase !== "not-started" && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Previous topic"
              className={cn(HOST_BUTTON, "bg-room-control hover:bg-room-line")}
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {progress.phase !== "finished" && (
            <button
              type="button"
              onClick={onNext}
              className={cn(HOST_BUTTON, "bg-brand text-white hover:bg-brand-hover")}
            >
              {progress.phase === "not-started" ? (
                <>
                  <Play size={14} />
                  Start agenda
                </>
              ) : progress.isLast ? (
                <>
                  <Check size={15} />
                  Finish
                </>
              ) : (
                <>
                  Next topic
                  <SkipForward size={14} />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RunningItem({
  item,
  index,
  count,
  serverNow,
}: {
  item: AgendaItem;
  index: number;
  count: number;
  serverNow: number;
}) {
  const timing = itemTiming(item, serverNow);
  const share = Math.min(1, timing.elapsedSeconds / (item.duration_minutes * 60));
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-[12px] text-room-faint tabular-nums">
          {index + 1}/{count}
        </span>
        <span className="truncate text-sm font-medium">{item.title}</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-md px-2 py-0.5 text-[13px] font-semibold tabular-nums",
            TONE_CLASSES[timing.tone],
          )}
          aria-label={timing.tone === "over" ? "Over time" : "Time left"}
        >
          {timing.tone === "over"
            ? `+${formatCountdown(-timing.remainingSeconds)}`
            : formatCountdown(timing.remainingSeconds)}
        </span>
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-room-control" aria-hidden>
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-1000",
            BAR_TONE_CLASSES[timing.tone],
          )}
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </span>
  );
}
