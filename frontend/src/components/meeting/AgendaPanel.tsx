"use client";

import { Check, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { inputBaseClassName } from "@/components/ui/Field";
import { useNow } from "@/hooks/useNow";
import {
  actualMinutes,
  agendaProgress,
  formatCountdown,
  itemTiming,
  MAX_AGENDA_ITEMS,
  MAX_ITEM_MINUTES,
  totalMinutes,
} from "@/lib/agenda";
import { cn } from "@/lib/cn";
import type { AgendaItem } from "@/lib/types";

import { SidePanelFrame } from "./SidePanelFrame";

type AgendaPanelProps = {
  agenda: AgendaItem[];
  clockOffsetMs: number;
  isHost: boolean;
  onAdd: (title: string, minutes: number) => void;
  onClose: () => void;
};

/** Every topic with its plan and what really happened; the host can add more. */
export function AgendaPanel({ agenda, clockOffsetMs, isHost, onAdd, onClose }: AgendaPanelProps) {
  const now = useNow();
  const progress = agendaProgress(agenda);
  const runningIndex = progress.phase === "running" ? progress.index : -1;
  const serverNow = (now?.getTime() ?? 0) + clockOffsetMs;

  return (
    <SidePanelFrame
      title={`Agenda${agenda.length ? ` (${totalMinutes(agenda)} min)` : ""}`}
      onClose={onClose}
      footer={
        isHost ? (
          <AddItemForm onAdd={onAdd} isFull={agenda.length >= MAX_AGENDA_ITEMS} />
        ) : undefined
      }
    >
      {agenda.length === 0 ? (
        <p className="px-6 pt-10 text-center text-[13px] text-ink-muted">
          {isHost
            ? "No agenda yet. Add the topics you want to cover and keep the meeting on time."
            : "This meeting has no agenda."}
        </p>
      ) : (
        <ol className="py-2">
          {agenda.map((item, index) => {
            const done = item.ended_at !== null;
            const running = index === runningIndex;
            const took = actualMinutes(item);
            const timing = running && now ? itemTiming(item, serverNow) : null;
            return (
              <li
                key={item.id}
                className={cn("flex items-start gap-3 px-4 py-2.5", running && "bg-brand-soft/60")}
                aria-current={running ? "step" : undefined}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    done
                      ? "bg-accent-soft text-accent-ink"
                      : running
                        ? "bg-brand text-white"
                        : "bg-hover text-ink-muted",
                  )}
                >
                  {done ? <Check size={13} strokeWidth={3} /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm break-words",
                      done ? "text-ink-muted" : "font-medium text-ink",
                    )}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {item.duration_minutes} min planned
                    {done && took !== null && (
                      <span
                        className={took > item.duration_minutes ? "text-danger" : "text-accent-ink"}
                      >
                        {" "}
                        · took {took} min
                      </span>
                    )}
                  </p>
                </div>
                {timing && (
                  <span
                    className={cn(
                      "shrink-0 text-[13px] font-semibold tabular-nums",
                      timing.tone === "over"
                        ? "text-danger"
                        : timing.tone === "warn"
                          ? "text-warning-ink"
                          : "text-brand",
                    )}
                  >
                    {timing.tone === "over"
                      ? `+${formatCountdown(-timing.remainingSeconds)}`
                      : formatCountdown(timing.remainingSeconds)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </SidePanelFrame>
  );
}

const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60];

function AddItemForm({
  onAdd,
  isFull,
}: {
  onAdd: (title: string, minutes: number) => void;
  isFull: boolean;
}) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(10);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isFull) return;
    onAdd(trimmed, Math.min(MAX_ITEM_MINUTES, Math.max(1, minutes)));
    setTitle("");
  }

  if (isFull) {
    return (
      <p className="text-[12px] text-ink-muted">
        The agenda has the maximum of {MAX_AGENDA_ITEMS} topics.
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        aria-label="New topic"
        placeholder="Add a topic"
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className={cn(inputBaseClassName, "min-w-0 flex-1")}
      />
      <select
        aria-label="Minutes for the new topic"
        value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))}
        className={cn(inputBaseClassName, "w-24 shrink-0 px-2.5")}
      >
        {MINUTE_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {choice} min
          </option>
        ))}
      </select>
      <button
        type="submit"
        aria-label="Add topic"
        disabled={!title.trim()}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={18} />
      </button>
    </form>
  );
}
