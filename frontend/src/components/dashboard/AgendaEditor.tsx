"use client";

import { Plus, X } from "lucide-react";

import { inputBaseClassName } from "@/components/ui/Field";
import { MAX_AGENDA_ITEMS, totalMinutes } from "@/lib/agenda";
import { cn } from "@/lib/cn";

/** One row of the editor. `key` only identifies the row for React. */
export type DraftItem = { key: number; title: string; duration_minutes: number };

const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90];
let nextKey = 1;

export function draftItem(title = "", minutes = 10): DraftItem {
  return { key: nextKey++, title, duration_minutes: minutes };
}

type AgendaEditorProps = {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  /** The meeting's length, to warn when the agenda does not fit. */
  meetingMinutes: number;
};

/** Planning the agenda while scheduling: a list of topics with minutes each. */
export function AgendaEditor({ items, onChange, meetingMinutes }: AgendaEditorProps) {
  const planned = totalMinutes(items.filter((item) => item.title.trim()));
  const update = (key: number, change: Partial<DraftItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...change } : item)));

  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm text-ink">
        <span>Agenda (optional)</span>
        {planned > 0 && (
          <span
            className={cn(
              "text-[12px]",
              planned > meetingMinutes ? "text-warning-ink" : "text-ink-muted",
            )}
          >
            {planned} of {meetingMinutes} min
            {planned > meetingMinutes && ": longer than the meeting"}
          </span>
        )}
      </legend>

      {items.length > 0 && (
        <ol className="mb-2 space-y-2">
          {items.map((item, index) => (
            <li key={item.key} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-[12px] text-ink-faint tabular-nums">
                {index + 1}
              </span>
              <input
                aria-label={`Topic ${index + 1}`}
                placeholder="Topic"
                maxLength={200}
                value={item.title}
                onChange={(event) => update(item.key, { title: event.target.value })}
                className={cn(inputBaseClassName, "min-w-0 flex-1")}
              />
              <select
                aria-label={`Minutes for topic ${index + 1}`}
                value={item.duration_minutes}
                onChange={(event) =>
                  update(item.key, { duration_minutes: Number(event.target.value) })
                }
                className={cn(inputBaseClassName, "w-24 shrink-0 px-2.5")}
              >
                {(MINUTE_CHOICES.includes(item.duration_minutes)
                  ? MINUTE_CHOICES
                  : [item.duration_minutes, ...MINUTE_CHOICES]
                ).map((choice) => (
                  <option key={choice} value={choice}>
                    {choice} min
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(items.filter(({ key }) => key !== item.key))}
                aria-label={`Remove topic ${index + 1}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-danger"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {items.length < MAX_AGENDA_ITEMS ? (
        <button
          type="button"
          onClick={() => onChange([...items, draftItem()])}
          className="flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
        >
          <Plus size={14} />
          Add topic
        </button>
      ) : (
        <p className="text-[12px] text-ink-muted">
          An agenda can have up to {MAX_AGENDA_ITEMS} topics.
        </p>
      )}
    </fieldset>
  );
}
