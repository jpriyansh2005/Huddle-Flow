"use client";

import { Send } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/datetime";
import type { ChatMessage } from "@/lib/types";

import { SidePanelFrame } from "./SidePanelFrame";

type ChatPanelProps = {
  messages: ChatMessage[];
  selfId: number | null;
  onSend: (text: string) => void;
  onClose: () => void;
};

/** In-meeting chat to everyone. Messages last only as long as the meeting. */
export function ChatPanel({ messages, selfId, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <SidePanelFrame
      title="Meeting chat"
      onClose={onClose}
      footer={
        <form onSubmit={handleSubmit}>
          <p className="mb-2 text-[12px] text-ink-muted">
            To: <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand">Everyone</span>
          </p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              aria-label="Message"
              placeholder="Type message here..."
              maxLength={1000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-field px-3 text-sm placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          </div>
        </form>
      }
    >
      {messages.length === 0 ? (
        <p className="px-6 pt-10 text-center text-[13px] text-ink-muted">
          No messages yet. Messages are visible to everyone in the meeting.
        </p>
      ) : (
        <ul className="space-y-3 p-4">
          {messages.map((message) => {
            const isOwn = message.sender_id === selfId;
            return (
              <li key={message.id} className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}>
                <p className="mb-1 text-[12px] text-ink-muted">
                  <span className="font-semibold text-ink">{isOwn ? "You" : message.sender_name}</span>{" "}
                  {formatTime(new Date(message.sent_at))}
                </p>
                <p
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                    isOwn ? "bg-brand-soft" : "bg-canvas",
                  )}
                >
                  {message.text}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />
    </SidePanelFrame>
  );
}
