"use client";

import { Circle, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/cn";
import { formatDueDate, formatDuration, formatTime, minutesBetween } from "@/lib/datetime";
import { agendaReview, formatPresence, topicOutcome } from "@/lib/recap";
import type {
  ActionItem,
  AgendaItem,
  Attendee,
  ChatMessage,
  Note,
  Recap,
  TranscriptLine,
} from "@/lib/types";

/** The few numbers that say how the meeting went. */
export function AtAGlanceCard({ recap }: { recap: Recap }) {
  const { meeting } = recap;
  const now = useNow(60_000);
  const end = meeting.ended_at ? new Date(meeting.ended_at) : now;
  const length =
    meeting.started_at && end
      ? formatDuration(minutesBetween(new Date(meeting.started_at), end))
      : "-";
  const open = recap.action_items.filter((item) => !item.done).length;

  const stats: Array<[string, ReactNode]> = [
    ["Length", length],
    ["People", recap.attendees.length],
    ["Action items", recap.action_items.length ? `${open} open` : "None"],
    ["Notes", recap.notes.length],
  ];

  return (
    <Card title="At a glance" titleId="recap-glance">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-line">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-white px-5 py-3.5">
            <dt className="text-[12px] text-ink-muted">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function ActionItemsCard({ items }: { items: ActionItem[] }) {
  const now = useNow(60_000);
  const done = items.filter((item) => item.done).length;

  return (
    <Card
      title="Action items"
      titleId="recap-actions"
      subtitle={items.length ? `${items.length - done} open · ${done} done` : undefined}
    >
      {items.length === 0 ? (
        <Empty>No action items were added in this meeting.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const due = item.due_date && now ? formatDueDate(item.due_date, now) : null;
            const Icon = item.done ? CircleCheck : Circle;
            return (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                <Icon
                  size={18}
                  aria-label={item.done ? "Done" : "Open"}
                  className={cn("mt-0.5 shrink-0", item.done ? "text-accent" : "text-ink-faint")}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm break-words",
                      item.done ? "text-ink-muted line-through" : "font-medium text-ink",
                    )}
                  >
                    {item.text}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-muted">
                    <span>{item.owner_name ?? "Unassigned"}</span>
                    {due && (
                      <span className={cn(due.overdue && !item.done && "font-medium text-danger")}>
                        {due.text}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const OUTCOME_CLASS = {
  over: "bg-danger/10 text-danger",
  under: "bg-accent-soft text-accent-ink",
  "on-time": "bg-accent-soft text-accent-ink",
  running: "bg-brand-soft text-brand-ink",
  skipped: "bg-hover text-ink-muted",
} as const;

/** Each topic's plan against what really happened. */
export function AgendaCard({ agenda }: { agenda: AgendaItem[] }) {
  const review = agendaReview(agenda);

  return (
    <Card
      title="Agenda"
      titleId="recap-agenda"
      subtitle={`${review.covered} of ${review.total} ${review.total === 1 ? "topic" : "topics"} covered · ${review.actual} of ${review.planned} min used`}
    >
      <ol className="divide-y divide-line">
        {agenda.map((item, index) => {
          const outcome = topicOutcome(item);
          const label =
            outcome.kind === "skipped"
              ? "Not reached"
              : outcome.kind === "running"
                ? "In progress"
                : outcome.kind === "on-time"
                  ? `On time · ${outcome.actual} min`
                  : `${outcome.difference} min ${outcome.kind} · ${outcome.actual} min`;
          return (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-5 shrink-0 text-[13px] font-semibold text-ink-faint">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words text-ink">{item.title}</p>
                <p className="text-[12px] text-ink-muted">{item.duration_minutes} min planned</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap",
                  OUTCOME_CLASS[outcome.kind],
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function NotesCard({ notes }: { notes: Note[] }) {
  return (
    <Card
      title="Notes"
      titleId="recap-notes"
      subtitle={
        notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}` : undefined
      }
    >
      {notes.length === 0 ? (
        <Empty>No notes were taken in this meeting.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((note) => (
            <li key={note.id} className="px-5 py-3">
              <p className="text-[12px] text-ink-muted">
                <span className="font-semibold text-ink">{note.author_name}</span>
                {" · "}
                {formatTime(new Date(note.created_at))}
              </p>
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-ink">{note.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type LogEntry = { id: number; name: string; at: string; text: string };

type LogCardProps = {
  title: string;
  titleId: string;
  entries: LogEntry[];
  total: number;
  /** "message" or "line": used in "12 messages" and "Show the chat". */
  noun: string;
  thing: string;
  empty: string;
};

/**
 * A long, time-ordered record (chat, transcript), folded away by default
 * because it is usually the longest part of the page.
 */
function LogCard({ title, titleId, entries, total, noun, thing, empty }: LogCardProps) {
  return (
    <Card
      title={title}
      titleId={titleId}
      subtitle={total ? `${total} ${total === 1 ? noun : `${noun}s`}` : undefined}
    >
      {entries.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <details className="group">
          <summary className="cursor-pointer list-none px-5 py-3 text-[13px] font-medium text-brand hover:bg-brand-soft/50 group-open:border-b group-open:border-line">
            <span className="group-open:hidden">Show the {thing}</span>
            <span className="hidden group-open:inline">Hide the {thing}</span>
          </summary>
          {total > entries.length && (
            <p className="px-5 pt-3 text-[12px] text-ink-muted">
              Showing the latest {entries.length} of {total} {noun}s.
            </p>
          )}
          <ul className="space-y-2.5 px-5 py-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p className="text-[12px] text-ink-muted">
                  <span className="font-semibold text-ink">{entry.name}</span>
                  {" · "}
                  {formatTime(new Date(entry.at))}
                </p>
                <p className="text-sm break-words whitespace-pre-wrap text-ink">{entry.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export function ChatCard({ messages, total }: { messages: ChatMessage[]; total: number }) {
  return (
    <LogCard
      title="Chat"
      titleId="recap-chat"
      noun="message"
      thing="chat"
      empty="No messages were sent in the chat."
      total={total}
      entries={messages.map((message) => ({
        id: message.id,
        name: message.sender_name,
        at: message.sent_at,
        text: message.text,
      }))}
    />
  );
}

/** What live captions saved. Shown only for meetings that had captions on. */
export function TranscriptCard({ lines, total }: { lines: TranscriptLine[]; total: number }) {
  return (
    <LogCard
      title="Transcript"
      titleId="recap-transcript"
      noun="line"
      thing="transcript"
      empty="Nothing was captioned."
      total={total}
      entries={lines.map((line) => ({
        id: line.id,
        name: line.speaker_name,
        at: line.spoken_at,
        text: line.text,
      }))}
    />
  );
}

export function AttendeesCard({ attendees }: { attendees: Attendee[] }) {
  return (
    <Card title="People" titleId="recap-people" subtitle={`${attendees.length} attended`}>
      {attendees.length === 0 ? (
        <Empty>Nobody joined this meeting.</Empty>
      ) : (
        <ul className="py-1.5">
          {attendees.map((person, index) => (
            <li key={`${person.name}-${index}`} className="flex items-center gap-3 px-5 py-2">
              <Avatar name={person.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {person.name}
                  {person.is_host && (
                    <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-ink">
                      Host
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-ink-muted">
                  {formatPresence(person.seconds_present)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-center text-[13px] text-ink-muted">{children}</p>;
}
