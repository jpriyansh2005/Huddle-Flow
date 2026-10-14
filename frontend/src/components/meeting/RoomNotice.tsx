import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/ui/Logo";

type RoomNoticeProps = {
  title: string;
  message?: string;
  /** Buttons or links under the message. Defaults to "Back to home". */
  actions?: ReactNode;
};

/**
 * A full-page message: meeting ended, invalid link, removed by host...
 * The logo in a thin header, then a centred heading, text and a wide button.
 */
export function RoomNotice({ title, message, actions }: RoomNoticeProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center border-b border-line bg-white px-6 sm:px-11">
        <Link href="/" aria-label="HuddleFlow home" className="rounded-md">
          <Logo size={30} />
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 pt-[18vh] text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {message && <p className="mt-4 max-w-[480px] text-sm text-ink">{message}</p>}
        <div className="mt-10 flex w-full max-w-[400px] flex-col gap-4">
          {actions ?? (
            <Link
              href="/"
              className="flex h-11 items-center justify-center rounded-xl bg-brand text-[15px] font-medium text-white shadow-card hover:bg-brand-hover"
            >
              Back to home
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
