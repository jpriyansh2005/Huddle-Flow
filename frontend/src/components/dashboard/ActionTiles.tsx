"use client";

import { CalendarPlus, LogIn, type LucideIcon, MonitorUp, Video } from "lucide-react";

import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

import { useDashboard } from "./DashboardProvider";

/** The four quick actions on the home screen. */
export function ActionTiles() {
  const { isLaunching, startInstantMeeting, openJoinDialog, openScheduleDialog } = useDashboard();
  const showToast = useToast();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="New meeting"
        hint="Start an instant meeting"
        icon={Video}
        featured
        busy={isLaunching}
        onClick={startInstantMeeting}
      />
      <Tile label="Join" hint="Use an ID or invite link" icon={LogIn} onClick={openJoinDialog} />
      <Tile
        label="Schedule"
        hint="Plan a meeting for later"
        icon={CalendarPlus}
        onClick={() => openScheduleDialog()}
      />
      <Tile
        label="Share screen"
        hint="Present in a meeting"
        icon={MonitorUp}
        onClick={() => showToast("Start or join a meeting to share your screen")}
      />
    </div>
  );
}

type TileProps = {
  label: string;
  hint: string;
  icon: LucideIcon;
  /** The main action, drawn in the brand colour. */
  featured?: boolean;
  busy?: boolean;
  onClick: () => void;
};

function Tile({ label, hint, icon: Icon, featured = false, busy = false, onClick }: TileProps) {
  return (
    <button
      type="button"
      // The short label names the button; the hint is extra visible detail.
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className={cn(
        "group flex min-h-[120px] flex-col justify-between rounded-2xl p-4 text-left shadow-card transition-colors",
        featured
          ? "bg-brand text-white hover:bg-brand-hover"
          : "border border-line bg-white text-ink hover:border-[#c9d1f5] hover:bg-[#fbfcff]",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          featured ? "bg-white/18 text-white" : "bg-brand-soft text-brand",
        )}
      >
        {busy ? <Spinner className="size-5" /> : <Icon size={21} strokeWidth={2} />}
      </span>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className={cn("block text-[13px]", featured ? "text-white/80" : "text-ink-muted")}>
          {hint}
        </span>
      </span>
    </button>
  );
}
