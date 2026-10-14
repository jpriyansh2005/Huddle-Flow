"use client";

import { FileQuestion, Radio } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback } from "react";

import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import type { Recap } from "@/lib/types";

import { RecapHeader } from "./RecapHeader";
import {
  ActionItemsCard,
  AgendaCard,
  AtAGlanceCard,
  AttendeesCard,
  ChatCard,
  NotesCard,
  TranscriptCard,
} from "./RecapSections";
import { SummaryCard } from "./SummaryCard";

/** Loads a meeting's recap and lays it out: the record first, people on the side. */
export function RecapView({ code }: { code: string }) {
  const key = useSearchParams().get("key");
  const load = useCallback(() => api.getRecap(code, key), [code, key]);
  const { data, error, reload } = useFetch(load);

  if (!data) {
    if (!error) return <RecapSkeleton />;
    return (
      <RecapFrame signedIn={null}>
        <div
          role="alert"
          className="mx-auto mt-[10vh] max-w-md rounded-2xl border border-line bg-white px-6 py-10 text-center shadow-card"
        >
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <FileQuestion size={22} />
          </span>
          <h1 className="text-lg font-semibold text-navy">Can&apos;t open this recap</h1>
          <p className="mt-2 text-sm text-ink-muted">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={reload}>
              Try again
            </Button>
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Go to HuddleFlow
            </Link>
          </div>
        </div>
      </RecapFrame>
    );
  }

  return (
    <RecapFrame signedIn={data.viewer.signed_in}>
      <RecapContent recap={data} />
    </RecapFrame>
  );
}

function RecapContent({ recap }: { recap: Recap }) {
  const { meeting } = recap;
  return (
    <>
      <RecapHeader recap={recap} />
      {meeting.status === "live" && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-[13px] text-accent-ink">
          <Radio size={16} className="shrink-0" />
          This meeting is still going on. Refresh the page to see the latest.
        </p>
      )}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside
          aria-label="Summary"
          className="grid content-start gap-6 lg:col-start-2 lg:row-start-1"
        >
          <AtAGlanceCard recap={recap} />
          <AttendeesCard attendees={recap.attendees} />
        </aside>
        <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-start-1">
          <SummaryCard
            code={meeting.code}
            initial={recap.summary}
            canWrite={recap.viewer.is_host && recap.summaries_enabled}
          />
          <ActionItemsCard items={recap.action_items} />
          {meeting.agenda.length > 0 && <AgendaCard agenda={meeting.agenda} />}
          <NotesCard notes={recap.notes} />
          {recap.transcript_total > 0 && (
            <TranscriptCard lines={recap.transcript} total={recap.transcript_total} />
          )}
          <ChatCard messages={recap.chat} total={recap.chat_total} />
        </div>
      </div>
    </>
  );
}

/** The page frame: a slim top bar, then the content. The bar is not printed. */
function RecapFrame({ signedIn, children }: { signedIn: boolean | null; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <header className="flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-8 print:hidden">
        <Link href="/" aria-label="HuddleFlow home" className="rounded-md">
          <Logo size={30} />
        </Link>
        {signedIn === true && (
          <Link href="/" className="text-sm font-medium text-brand hover:underline">
            Back to dashboard
          </Link>
        )}
        {signedIn === false && (
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-ink hover:underline">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Get started
            </Link>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}

export function RecapSkeleton() {
  return (
    <RecapFrame signedIn={null}>
      <div aria-busy="true" aria-label="Loading the recap" className="animate-pulse space-y-6">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-line" />
          <div className="h-7 w-72 max-w-full rounded bg-line" />
          <div className="h-4 w-96 max-w-full rounded bg-line" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-64 rounded-2xl bg-line/60" />
          <div className="h-64 rounded-2xl bg-line/60" />
        </div>
      </div>
    </RecapFrame>
  );
}
