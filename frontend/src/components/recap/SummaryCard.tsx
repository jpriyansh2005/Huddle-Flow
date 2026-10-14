"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { formatShortDate, formatTime } from "@/lib/datetime";
import type { MeetingSummary } from "@/lib/types";

type SummaryCardProps = {
  code: string;
  initial: MeetingSummary | null;
  /** The viewer is the host and the server has an AI provider configured. */
  canWrite: boolean;
};

/**
 * The AI summary at the top of the recap. Everyone sees it once it exists;
 * only the host can ask for it to be written, or rewritten.
 */
export function SummaryCard({ code, initial, canWrite }: SummaryCardProps) {
  const [summary, setSummary] = useState(initial);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!summary && !canWrite) return null;

  async function write() {
    setWriting(true);
    setError(null);
    try {
      setSummary(await api.createSummary(code));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setWriting(false);
    }
  }

  const button = canWrite && (
    <Button
      variant={summary ? "outline" : "primary"}
      size="sm"
      disabled={writing}
      onClick={() => void write()}
      className="print:hidden"
    >
      {writing ? (
        <Spinner className="size-4" />
      ) : summary ? (
        <RefreshCw size={14} />
      ) : (
        <Sparkles size={14} />
      )}
      {writing ? "Writing..." : summary ? "Rewrite" : "Write summary"}
    </Button>
  );

  return (
    <Card
      title="Summary"
      titleId="recap-summary"
      subtitle={summary ? "Written by AI from the notes, transcript and chat" : undefined}
      actions={summary ? button : undefined}
    >
      <div aria-live="polite" aria-busy={writing}>
        {summary ? (
          <div className="space-y-4 px-5 py-4">
            <p className="text-[15px] leading-relaxed break-words text-ink">{summary.overview}</p>
            <PointList title="Key points" points={summary.key_points} />
            <PointList title="Decisions" points={summary.decisions} />
            <PointList title="Open questions" points={summary.open_questions} />
            <p className="text-[12px] text-ink-faint">
              {summary.model} · {formatShortDate(new Date(summary.created_at))},{" "}
              {formatTime(new Date(summary.created_at))}. AI can make mistakes; check it against the
              notes.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <p className="max-w-xl text-sm text-ink-muted">
              Let AI write an overview, the key points, decisions and open questions. The
              meeting&apos;s notes, transcript and chat are sent to the AI provider to do this.
            </p>
            {button}
          </div>
        )}
        {error && (
          <p role="alert" className="border-t border-line px-5 py-3 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

function PointList({ title, points }: { title: string; points: string[] }) {
  if (points.length === 0) return null;
  return (
    <div>
      <h3 className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink marker:text-ink-faint">
        {points.map((point, index) => (
          <li key={index} className="break-words">
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
