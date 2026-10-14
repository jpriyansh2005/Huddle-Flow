"use client";

import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, inputClassName } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import {
  formatTime,
  fromDateAndTimeInputs,
  localTimeZone,
  nextHalfHour,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/datetime";
import type { Meeting } from "@/lib/types";

import { AgendaEditor, type DraftItem, draftItem } from "./AgendaEditor";

type ScheduleMeetingDialogProps = {
  /** Pass a meeting to edit it; leave out to schedule a new one. */
  meeting?: Meeting;
  onClose: () => void;
  onSaved: (meeting: Meeting, wasEdit: boolean) => void;
};

const HOUR_OPTIONS = Array.from({ length: 11 }, (_, hours) => hours); // 0 to 10
const MINUTE_OPTIONS = [0, 15, 30, 45];
const DEFAULT_DURATION_MINUTES = 30;

/** Every quarter hour of the day, as { value: "14:30", label: "2:30 PM" }. */
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const time = new Date(2000, 0, 1, Math.floor(index / 4), (index % 4) * 15);
  return { value: toTimeInputValue(time), label: formatTime(time) };
});

/** The "Schedule meeting" dialog. Also used to edit a scheduled meeting. */
export function ScheduleMeetingDialog({ meeting, onClose, onSaved }: ScheduleMeetingDialogProps) {
  const isEdit = meeting !== undefined;

  // Lazy initialisers run once, when the dialog opens.
  const [initialStart] = useState(() =>
    meeting?.scheduled_start ? new Date(meeting.scheduled_start) : nextHalfHour(new Date()),
  );
  const initialDuration = meeting?.duration_minutes ?? DEFAULT_DURATION_MINUTES;

  const [title, setTitle] = useState(meeting?.title ?? "My Meeting");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [date, setDate] = useState(toDateInputValue(initialStart));
  const [time, setTime] = useState(toTimeInputValue(initialStart));
  const [hours, setHours] = useState(Math.floor(initialDuration / 60));
  const [minutes, setMinutes] = useState(initialDuration % 60);
  const [agenda, setAgenda] = useState<DraftItem[]>(() =>
    (meeting?.agenda ?? []).map((item) => draftItem(item.title, item.duration_minutes)),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // A meeting being edited may start at a time that is not on a quarter
  // hour (e.g. 10:20). Add it so the select can show the real value.
  const timeOptions = TIME_OPTIONS.some((option) => option.value === time)
    ? TIME_OPTIONS
    : [{ value: time, label: formatTime(fromDateAndTimeInputs(date, time)) }, ...TIME_OPTIONS];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const start = fromDateAndTimeInputs(date, time);
    const durationMinutes = hours * 60 + minutes;
    if (!title.trim()) return setError("Enter a topic for the meeting.");
    if (!date || Number.isNaN(start.getTime())) return setError("Choose a date.");
    if (durationMinutes === 0) return setError("The duration must be longer than 0 minutes.");
    if (start.getTime() < Date.now()) return setError("Choose a start time in the future.");

    const input = {
      title: title.trim(),
      description: description.trim() || null,
      // toISOString() converts the local time to UTC, which the API expects.
      scheduled_start: start.toISOString(),
      duration_minutes: durationMinutes,
      // Rows left without a topic are simply dropped.
      agenda: agenda
        .filter((item) => item.title.trim())
        .map((item) => ({ title: item.title.trim(), duration_minutes: item.duration_minutes })),
    };

    setIsSaving(true);
    setError(null);
    try {
      const saved = isEdit
        ? await api.updateMeeting(meeting.code, input)
        : await api.scheduleMeeting(input);
      onSaved(saved, isEdit);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "Edit meeting" : "Schedule meeting"}
      onClose={onClose}
      widthClassName="max-w-[520px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Topic" htmlFor="schedule-title">
          <input
            id="schedule-title"
            autoFocus
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClassName}
          />
        </Field>

        <Field label="Description (optional)" htmlFor="schedule-description">
          <textarea
            id="schedule-description"
            rows={2}
            maxLength={2000}
            placeholder="Add a description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${inputClassName} h-auto resize-none py-2`}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="schedule-date">
            <input
              id="schedule-date"
              type="date"
              required
              min={isEdit ? undefined : toDateInputValue(new Date())}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Start time" htmlFor="schedule-time">
            <select
              id="schedule-time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className={inputClassName}
            >
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duration" htmlFor="schedule-hours">
            <div className="flex gap-2">
              <select
                id="schedule-hours"
                aria-label="Duration hours"
                value={hours}
                onChange={(event) => setHours(Number(event.target.value))}
                className={inputClassName}
              >
                {HOUR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} {option === 1 ? "hour" : "hours"}
                  </option>
                ))}
              </select>
              <select
                aria-label="Duration minutes"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
                className={inputClassName}
              >
                {(MINUTE_OPTIONS.includes(minutes)
                  ? MINUTE_OPTIONS
                  : [minutes, ...MINUTE_OPTIONS]
                ).map((option) => (
                  <option key={option} value={option}>
                    {option} min
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <div>
            <p className="mb-1.5 text-sm">Time zone</p>
            <p className="flex h-10 items-center text-sm text-ink-muted">{localTimeZone()}</p>
          </div>
        </div>

        <AgendaEditor items={agenda} onChange={setAgenda} meetingMinutes={hours * 60 + minutes} />

        <div>
          <p className="mb-1.5 text-sm">Meeting ID</p>
          <p className="text-sm text-ink-muted">
            {isEdit
              ? "The meeting ID and invite link stay the same."
              : "Generated automatically, together with the invite link, when you save."}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/8 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving} className="min-w-20">
            {isSaving ? <Spinner className="size-4" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
