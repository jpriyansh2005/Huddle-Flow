"use client";

import { Captions } from "lucide-react";

import { useNow } from "@/hooks/useNow";
import type { CaptionProblem } from "@/lib/realtime/speechRecognizer";
import type { LiveCaption } from "@/lib/types";

/** How long a line stays on screen after the speaker's last word. */
const FINISHED_VISIBLE_MS = 5000;
const UNFINISHED_VISIBLE_MS = 8000;
/** At most this many speakers' lines at once, the most recent ones. */
const MAX_LINES = 3;

type CaptionsOverlayProps = {
  captions: Record<number, LiveCaption>;
  selfId: number | null;
  /** This viewer hid the caption text (captions stay on for the room). */
  hidden: boolean;
  /** Whether this browser can caption its own speaker. */
  supported: boolean;
  problem: CaptionProblem | null;
};

/**
 * Shown while the host has captions on: the latest line from each person
 * who is talking, and a note if this browser cannot caption its own speaker.
 * (The "Captions on" badge itself is in the meeting header.)
 */
export function CaptionsOverlay({
  captions,
  selfId,
  hidden,
  supported,
  problem,
}: CaptionsOverlayProps) {
  const now = useNow(1000);
  const lines = now
    ? Object.values(captions)
        .filter((caption) => {
          const age = now.getTime() - caption.updatedAt;
          return age < (caption.final ? FINISHED_VISIBLE_MS : UNFINISHED_VISIBLE_MS);
        })
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(-MAX_LINES)
    : [];

  const ownNote = !supported
    ? "Your browser can't caption your voice. Chrome or Edge can."
    : problem === "blocked"
      ? "Captions can't use your microphone. Allow it and reload the page."
      : problem === "failed"
        ? "Captioning your voice stopped. Reload the page to try again."
        : null;

  return (
    <>
      {ownNote && (
        <p className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-[12px] text-white">
          <Captions size={14} className="shrink-0" />
          {ownNote}
        </p>
      )}

      {!hidden && lines.length > 0 && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
          <div className="max-w-3xl space-y-1 rounded-xl bg-black/75 px-4 py-2.5 text-[15px] leading-snug text-white sm:text-base">
            {lines.map((caption) => (
              <p key={caption.participantId} className="break-words">
                <span className="font-semibold text-[#9fb0ff]">
                  {caption.participantId === selfId ? "You" : caption.speakerName}:
                </span>{" "}
                <span className={caption.final ? undefined : "text-white/85"}>{caption.text}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
