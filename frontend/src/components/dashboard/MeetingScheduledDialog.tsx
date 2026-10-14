"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDuration, formatLongDate, formatTime } from "@/lib/datetime";
import { buildInvitation, copyToClipboard } from "@/lib/invitation";
import { formatMeetingCode } from "@/lib/meetingCode";
import type { Meeting } from "@/lib/types";

type MeetingScheduledDialogProps = {
  meeting: Meeting;
  onClose: () => void;
};

/** Shown right after scheduling: the new meeting's ID and invite link. */
export function MeetingScheduledDialog({ meeting, onClose }: MeetingScheduledDialogProps) {
  const [copied, setCopied] = useState<"link" | "invitation" | null>(null);
  const start = meeting.scheduled_start ? new Date(meeting.scheduled_start) : null;

  async function copy(what: "link" | "invitation") {
    const text = what === "link" ? meeting.join_url : buildInvitation(meeting);
    if (await copyToClipboard(text)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <Modal title="Your meeting has been scheduled" onClose={onClose} widthClassName="max-w-[480px]">
      <dl className="space-y-3 text-sm">
        <Row label="Topic">{meeting.title}</Row>
        {start && (
          <Row label="When">
            {formatLongDate(start)}, {formatTime(start)}
            {meeting.duration_minutes && ` (${formatDuration(meeting.duration_minutes)})`}
          </Row>
        )}
        <Row label="Meeting ID">{formatMeetingCode(meeting.code)}</Row>
        {meeting.agenda.length > 0 && (
          <Row label="Agenda">
            <ol className="list-inside list-decimal font-normal">
              {meeting.agenda.map((item) => (
                <li key={item.id} className="truncate">
                  {item.title} <span className="text-ink-muted">({item.duration_minutes} min)</span>
                </li>
              ))}
            </ol>
          </Row>
        )}
        <Row label="Invite link">
          <span className="flex items-center gap-2">
            <a href={meeting.join_url} className="min-w-0 truncate text-brand hover:underline">
              {meeting.join_url}
            </a>
            <button
              type="button"
              onClick={() => copy("link")}
              aria-label="Copy invite link"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-hover"
            >
              {copied === "link" ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
            </button>
          </span>
        </Row>
      </dl>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => copy("invitation")}>
          {copied === "invitation" ? "Copied" : "Copy invitation"}
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 font-semibold">{children}</dd>
    </div>
  );
}
