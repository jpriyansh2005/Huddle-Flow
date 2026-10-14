import { CalendarCheck, MonitorUp, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/ui/Logo";

const HIGHLIGHTS = [
  { icon: MonitorUp, text: "Video meetings with screen sharing, chat and reactions" },
  { icon: CalendarCheck, text: "Schedule ahead and share an invite link in one click" },
  { icon: ShieldCheck, text: "Host controls to mute, remove or end for everyone" },
];

/**
 * The frame of the sign-in and sign-up pages: a navy brand panel on the left
 * (wide screens only) and the form on the right. The folder name is in
 * brackets, so it adds nothing to the URLs.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Logo tone="light" size={34} />
        <div className="max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Meetings that end with a plan.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-navy-muted">
            HuddleFlow brings your team together on video and keeps what was decided.
          </p>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3.5 text-[15px] text-white/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#9fb0ff]">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-navy-muted">HuddleFlow</p>
      </aside>

      <main className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo size={32} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
