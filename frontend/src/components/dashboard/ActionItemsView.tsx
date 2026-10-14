"use client";

import { CircleCheckBig, ListTodo } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useNow } from "@/hooks/useNow";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDueDate, formatShortDate } from "@/lib/datetime";
import type { MyActionItem } from "@/lib/types";

import { EmptyState, ErrorState, ListSkeleton } from "./ListStates";

type TabId = "open" | "done";

// Defined outside the component so useFetch gets the same function every render.
const loadItems = () => api.listMyActionItems();

/**
 * Every action item assigned to you, plus everything from meetings you hosted,
 * so nothing agreed in a meeting gets lost. Items can be ticked off here.
 */
export function ActionItemsView() {
  const { data, error, loading, reload } = useFetch(loadItems);
  const showToast = useToast();
  const [tab, setTab] = useState<TabId>("open");
  // Ticks made on this page, shown straight away while the server catches up.
  const [doneOverrides, setDoneOverrides] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());

  const items = (data ?? []).map((item) =>
    item.id in doneOverrides ? { ...item, done: doneOverrides[item.id] } : item,
  );
  const openItems = items.filter((item) => !item.done);
  const doneItems = items.filter((item) => item.done);
  const shown = tab === "open" ? openItems : doneItems;

  async function setDone(item: MyActionItem, done: boolean) {
    setDoneOverrides((current) => ({ ...current, [item.id]: done }));
    setSaving((current) => new Set(current).add(item.id));
    try {
      await api.setActionItemDone(item.id, done);
      showToast(done ? "Marked as done" : "Moved back to To do");
    } catch (failure) {
      // Put the tick back the way it was.
      setDoneOverrides((current) => ({ ...current, [item.id]: !done }));
      showToast(errorMessage(failure));
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "open", label: "To do", count: openItems.length },
    { id: "done", label: "Done", count: doneItems.length },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Action items" className="flex rounded-xl bg-[#e9edf5] p-1">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-8 rounded-lg px-4 text-sm font-medium transition-colors",
                tab === id ? "bg-white text-navy shadow-card" : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
              {data && <span className="ml-1.5 text-ink-faint">{count}</span>}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-ink-muted">
          Tasks assigned to you, and everything from meetings you host.
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-white shadow-card">
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <ListSkeleton rows={4} label="Loading action items" />
        ) : shown.length === 0 ? (
          tab === "open" ? (
            <EmptyState
              icon={ListTodo}
              title="Nothing to do"
              hint="Action items from your meetings will show up here."
            />
          ) : (
            <EmptyState icon={CircleCheckBig} title="Nothing finished yet" />
          )
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                saving={saving.has(item.id)}
                onDone={(done) => void setDone(item, done)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type ActionItemRowProps = {
  item: MyActionItem;
  saving: boolean;
  onDone: (done: boolean) => void;
};

function ActionItemRow({ item, saving, onDone }: ActionItemRowProps) {
  // Re-render each minute so "Due today" turns into "Overdue" after midnight.
  const now = useNow(60_000);
  const due = item.due_date && now ? formatDueDate(item.due_date, now) : null;
  const meetingDay = item.meeting.started_at ?? item.created_at;

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <input
        type="checkbox"
        checked={item.done}
        disabled={saving}
        onChange={(event) => onDone(event.target.checked)}
        aria-label={`Done: ${item.text}`}
        className="mt-1 size-4 shrink-0 accent-accent disabled:opacity-60"
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm break-words",
            item.done ? "text-ink-faint line-through" : "font-medium text-ink",
          )}
        >
          {item.text}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
          {item.assigned_to_me ? (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-ink">
              You
            </span>
          ) : (
            <span>{item.owner_name ?? "Unassigned"}</span>
          )}
          {due && (
            <span className={cn(due.overdue && !item.done && "font-medium text-danger")}>
              {due.text}
            </span>
          )}
          <span className="min-w-0 truncate">
            {item.meeting.title} · {formatShortDate(new Date(meetingDay))}
          </span>
        </p>
      </div>
    </li>
  );
}
