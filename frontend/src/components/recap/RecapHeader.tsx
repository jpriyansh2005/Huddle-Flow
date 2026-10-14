"use client";

import { Link2, Printer } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDuration, formatLongDateWithYear, formatTime, minutesBetween } from "@/lib/datetime";
import { copyToClipboard } from "@/lib/invitation";
import type { Recap } from "@/lib/types";

/** Title, when it happened and who hosted, with Share (host only) and Print. */
export function RecapHeader({ recap }: { recap: Recap }) {
  const { meeting, share_url } = recap;
  const showToast = useToast();
  // A recap is only served once the meeting has started.
  const started = new Date(meeting.started_at ?? meeting.created_at);
  const ended = meeting.ended_at ? new Date(meeting.ended_at) : null;

  async function share() {
    if (!share_url) return;
    const copied = await copyToClipboard(share_url);
    showToast(
      copied ? "Recap link copied. Anyone with it can read the recap." : "Couldn't copy the link",
    );
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold tracking-wide text-brand uppercase">
          Meeting recap
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words text-navy">
          {meeting.title}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {formatLongDateWithYear(started)}
          {" · "}
          {ended
            ? `${formatTime(started)} - ${formatTime(ended)} (${formatDuration(minutesBetween(started, ended))})`
            : `Started ${formatTime(started)}`}
          {" · "}
          Hosted by {meeting.host.name}
        </p>
        {meeting.description && (
          <p className="mt-2 max-w-3xl text-sm break-words whitespace-pre-line text-ink">
            {meeting.description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2 print:hidden">
        {share_url && (
          <Button variant="secondary" onClick={() => void share()}>
            <Link2 size={16} />
            Share recap
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={16} />
          Print
        </Button>
      </div>
    </div>
  );
}
