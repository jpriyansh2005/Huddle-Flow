"use client";

import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { inputBaseClassName } from "@/components/ui/Field";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/cn";
import { formatDueDate, formatTime } from "@/lib/datetime";
import type { ActionItem, ActionItemInput, Note, RoomParticipant } from "@/lib/types";

import { SidePanelFrame } from "./SidePanelFrame";

type Tab = "notes" | "actions";

type NotesPanelProps = {
  notes: Note[];
  actionItems: ActionItem[];
  participants: RoomParticipant[];
  selfId: number | null;
  isHost: boolean;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: number) => void;
  onAddActionItem: (input: ActionItemInput) => void;
  onToggleActionItem: (id: number, done: boolean) => void;
  onDeleteActionItem: (id: number) => void;
  onClose: () => void;
};

/**
 * The meeting's shared notes and action items. Everyone in the room sees the
 * same lists and can add to them; they are saved with the meeting.
 */
export function NotesPanel(props: NotesPanelProps) {
  const { notes, actionItems, onClose } = props;
  const [tab, setTab] = useState<Tab>("notes");
  const openItems = actionItems.filter((item) => !item.done).length;

  return (
    <SidePanelFrame
      title="Notes"
      onClose={onClose}
      footer={
        tab === "notes" ? (
          <NoteComposer onAdd={props.onAddNote} />
        ) : (
          <ActionComposer
            participants={props.participants}
            selfId={props.selfId}
            onAdd={props.onAddActionItem}
          />
        )
      }
    >
      <div role="tablist" aria-label="Notes" className="flex gap-1 border-b border-line px-3 pt-2">
        {(
          [
            ["notes", `Notes (${notes.length})`],
            ["actions", `Action items (${openItems})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px border-b-2 px-2.5 pb-2 text-[13px] font-medium",
              tab === id
                ? "border-brand text-brand"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "notes" ? <NoteList {...props} /> : <ActionList {...props} />}
    </SidePanelFrame>
  );
}

function NoteList({ notes, selfId, isHost, onDeleteNote }: NotesPanelProps) {
  if (notes.length === 0) {
    return (
      <p className="px-6 pt-10 text-center text-[13px] text-ink-muted">
        No notes yet. Write down decisions and ideas as they come up; everyone sees them.
      </p>
    );
  }
  return (
    <ul className="space-y-1 p-3">
      {notes.map((note) => {
        const canDelete = isHost || note.author_participant_id === selfId;
        return (
          <li key={note.id} className="group rounded-xl px-2.5 py-2 hover:bg-hover">
            <p className="flex items-center gap-2 text-[12px] text-ink-muted">
              <span className="font-semibold text-ink">
                {note.author_participant_id === selfId ? "You" : note.author_name}
              </span>
              {formatTime(new Date(note.created_at))}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDeleteNote(note.id)}
                  aria-label="Delete note"
                  className="ml-auto flex size-6 items-center justify-center rounded-md text-ink-faint opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-danger [@media(hover:none)]:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </p>
            <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-ink">{note.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

function ActionList({
  actionItems,
  selfId,
  isHost,
  onToggleActionItem,
  onDeleteActionItem,
}: NotesPanelProps) {
  // Re-render each minute so "Due today" turns into "Overdue" after midnight.
  const now = useNow(60_000);
  if (actionItems.length === 0) {
    return (
      <p className="px-6 pt-10 text-center text-[13px] text-ink-muted">
        No action items yet. Add a task with an owner so nothing is forgotten after the meeting.
      </p>
    );
  }
  return (
    <ul className="space-y-1 p-3">
      {actionItems.map((item) => {
        const due = item.due_date && now ? formatDueDate(item.due_date, now) : null;
        const canDelete = isHost || item.created_by_participant_id === selfId;
        return (
          <li
            key={item.id}
            className="group flex items-start gap-3 rounded-xl px-2.5 py-2 hover:bg-hover"
          >
            <input
              type="checkbox"
              checked={item.done}
              onChange={(event) => onToggleActionItem(item.id, event.target.checked)}
              aria-label={`Done: ${item.text}`}
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm break-words",
                  item.done ? "text-ink-faint line-through" : "text-ink",
                )}
              >
                {item.text}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-ink-muted">
                <span>{item.owner_name ?? "Unassigned"}</span>
                {due && (
                  <span className={due.overdue && !item.done ? "text-danger" : undefined}>
                    {due.text}
                  </span>
                )}
              </p>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDeleteActionItem(item.id)}
                aria-label={`Delete action item: ${item.text}`}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-faint opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-danger [@media(hover:none)]:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NoteComposer({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <textarea
        aria-label="New note"
        placeholder="Write a note (Shift+Enter for a new line)"
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className={cn(inputBaseClassName, "h-auto min-w-0 flex-1 resize-none py-2")}
      />
      <AddButton label="Add note" disabled={!text.trim()} />
    </form>
  );
}

function ActionComposer({
  participants,
  selfId,
  onAdd,
}: {
  participants: RoomParticipant[];
  selfId: number | null;
  onAdd: (input: ActionItemInput) => void;
}) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  // If the chosen owner leaves the room, fall back to "Unassigned".
  const ownerId = participants.some((participant) => String(participant.id) === owner) ? owner : "";

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({
      text: trimmed,
      owner_participant_id: ownerId ? Number(ownerId) : null,
      due_date: due || null,
    });
    setText("");
    setDue("");
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          aria-label="New action item"
          placeholder="Add an action item"
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={cn(inputBaseClassName, "min-w-0 flex-1")}
        />
        <AddButton label="Add action item" disabled={!text.trim()} />
      </div>
      <div className="flex gap-2">
        <select
          aria-label="Owner"
          value={ownerId}
          onChange={(event) => setOwner(event.target.value)}
          className={cn(inputBaseClassName, "min-w-0 flex-1 px-2.5")}
        >
          <option value="">Unassigned</option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.id === selfId
                ? `${participant.display_name} (me)`
                : participant.display_name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Due date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
          className={cn(inputBaseClassName, "w-[150px] shrink-0 px-2.5")}
        />
      </div>
    </form>
  );
}

function AddButton({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={disabled}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus size={18} />
    </button>
  );
}
