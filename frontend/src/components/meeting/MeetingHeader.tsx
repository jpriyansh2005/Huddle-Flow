"use client";

import { Captions, Check, Copy, Info, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Popover } from "@/components/ui/Popover";
import { useNow } from "@/hooks/useNow";
import type { RoomStatus } from "@/hooks/useMeetingRoom";
import { formatElapsed } from "@/lib/datetime";
import { copyToClipboard } from "@/lib/invitation";
import { formatMeetingCode } from "@/lib/meetingCode";
import type { Meeting } from "@/lib/types";

type MeetingHeaderProps = {
  meeting: Meeting;
  status: RoomStatus;
  /** The host has live captions on, so speech is being saved. */
  captionsOn: boolean;
};

/**
 * The title bar of a meeting: the info button and topic on the left,
 * the timer and the green security shield on the right.
 */
export function MeetingHeader({ meeting, status, captionsOn }: MeetingHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 bg-room-top px-3 text-room-text">
      <div className="flex min-w-0 items-center gap-1.5">
        <Popover
          label="Meeting information"
          align="start"
          triggerClassName="flex size-7 items-center justify-center rounded-md hover:bg-room-hover"
          trigger={<Info size={17} />}
        >
          {() => <MeetingInfoCard meeting={meeting} />}
        </Popover>
        <p className="truncate text-sm">{meeting.title}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-[13px] text-room-muted">
        {status === "reconnecting" && <span className="text-warning">Reconnecting...</span>}
        {status === "connecting" && <span>Connecting...</span>}
        {captionsOn && (
          <span
            title="Live captions are on. What people say is saved to the meeting transcript."
            className="flex items-center gap-1.5 rounded-md bg-room-control px-2 py-0.5 text-room-text"
          >
            <Captions size={14} aria-hidden />
            <span className="sm:hidden">CC on</span>
            <span className="hidden sm:inline">Captions on · saved to transcript</span>
          </span>
        )}
        <ElapsedTime since={meeting.started_at} />
        <span title="This meeting is protected" className="flex text-room-green">
          <ShieldCheck size={19} aria-label="This meeting is protected" />
        </span>
      </div>
    </header>
  );
}

function ElapsedTime({ since }: { since: string | null }) {
  const now = useNow();
  if (!now || !since) return null;
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 1000));
  return <span className="tabular-nums">{formatElapsed(seconds)}</span>;
}

/** The meeting info popover: topic, host, meeting ID and invite link. */
function MeetingInfoCard({ meeting }: { meeting: Meeting }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (await copyToClipboard(meeting.join_url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="w-[min(340px,calc(100vw-1.5rem))] rounded-xl bg-white p-4 text-ink shadow-popover">
      <h2 className="mb-3 text-[15px] font-semibold">{meeting.title}</h2>
      <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-ink-muted">Meeting ID</dt>
        <dd className="font-semibold">{formatMeetingCode(meeting.code)}</dd>
        <dt className="text-ink-muted">Host</dt>
        <dd>{meeting.host.name}</dd>
        <dt className="text-ink-muted">Invite link</dt>
        <dd className="min-w-0 break-all text-brand">{meeting.join_url}</dd>
      </dl>
      <button
        type="button"
        onClick={copyLink}
        className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
