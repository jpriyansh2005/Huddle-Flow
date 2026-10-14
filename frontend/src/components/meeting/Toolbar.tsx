"use client";

import {
  Ellipsis,
  Hand,
  Link2,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  NotebookPen,
  PhoneOff,
  ShieldHalf,
  SmilePlus,
  UsersRound,
  Video,
  VideoOff,
} from "lucide-react";

import { Popover } from "@/components/ui/Popover";
import type { LocalMedia } from "@/hooks/useLocalMedia";
import { cn } from "@/lib/cn";

export type SidePanel = "participants" | "chat" | "agenda" | "notes";

/** Must match ALLOWED_REACTIONS in backend/app/realtime/events.py. */
const REACTIONS = ["👏", "👍", "❤️", "😂", "😮", "🎉"];

/** The clickable area of a control: the round face with its label underneath. */
const BUTTON_CLASS =
  "group flex w-12 flex-col items-center gap-1 rounded-xl py-1 text-room-text sm:w-[68px]";
const MENU_CLASS =
  "rounded-xl border border-room-line bg-room-tile text-[13px] text-room-text shadow-popover";
const MENU_ITEM_CLASS = "flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-room-hover";

type ToolbarProps = {
  media: LocalMedia;
  isHost: boolean;
  participantCount: number;
  unreadMessages: number;
  activePanel: SidePanel | null;
  onTogglePanel: (panel: SidePanel) => void;
  onReact: (emoji: string) => void;
  onCopyInviteLink: () => void;
  onMuteAll: () => void;
  onLeave: () => void;
  onEndForAll: () => void;
};

/**
 * The control bar along the bottom of a meeting: microphone and camera on
 * the left, the meeting tools in the middle, End on the right.
 */
export function Toolbar({
  media,
  isHost,
  participantCount,
  unreadMessages,
  activePanel,
  onTogglePanel,
  onReact,
  onCopyInviteLink,
  onMuteAll,
  onLeave,
  onEndForAll,
}: ToolbarProps) {
  return (
    <footer className="flex h-[76px] shrink-0 items-center justify-between gap-1 bg-room-bar px-2 pb-[env(safe-area-inset-bottom)] sm:px-5">
      <div className="flex items-center">
        <ToolbarButton
          label={media.audioOn ? "Mute" : "Unmute"}
          icon={Mic}
          offIcon={MicOff}
          off={!media.audioOn}
          onClick={media.toggleAudio}
        />
        <ToolbarButton
          label={media.videoOn ? "Stop video" : "Start video"}
          icon={Video}
          offIcon={VideoOff}
          off={!media.videoOn}
          onClick={media.toggleVideo}
        />
      </div>

      <div className="flex items-center">
        <ToolbarButton
          label="People"
          icon={UsersRound}
          count={participantCount}
          active={activePanel === "participants"}
          onClick={() => onTogglePanel("participants")}
        />
        <ToolbarButton
          label="Chat"
          icon={MessageSquare}
          unread={unreadMessages}
          active={activePanel === "chat"}
          onClick={() => onTogglePanel("chat")}
        />
        {/* Below laptop width these two move into the More menu so the bar fits. */}
        <div className="hidden lg:block">
          <ToolbarButton
            label="Agenda"
            icon={ListChecks}
            active={activePanel === "agenda"}
            onClick={() => onTogglePanel("agenda")}
          />
        </div>
        <div className="hidden lg:block">
          <ToolbarButton
            label="Notes"
            icon={NotebookPen}
            active={activePanel === "notes"}
            onClick={() => onTogglePanel("notes")}
          />
        </div>

        <Popover
          label="Reactions"
          placement="top"
          triggerClassName={BUTTON_CLASS}
          trigger={<ButtonFace label="React" icon={SmilePlus} />}
        >
          {(close) => (
            <div className={cn(MENU_CLASS, "flex gap-1 p-1.5")}>
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  onClick={() => {
                    onReact(emoji);
                    close();
                  }}
                  className="flex size-10 items-center justify-center rounded-lg text-2xl transition-transform hover:scale-125 hover:bg-room-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </Popover>

        {media.canShareScreen && (
          // On phones Share and Host tools move into the "More" menu.
          <div className="hidden sm:block">
            <ToolbarButton
              label={media.isSharingScreen ? "Stop share" : "Share"}
              icon={MonitorUp}
              active={media.isSharingScreen}
              onClick={media.toggleScreenShare}
            />
          </div>
        )}

        {isHost && (
          <div className="hidden sm:block">
            <Popover
              label="Host tools"
              placement="top"
              triggerClassName={BUTTON_CLASS}
              trigger={<ButtonFace label="Host" icon={ShieldHalf} />}
            >
              {(close) => (
                <div className={cn(MENU_CLASS, "w-56 py-1.5")}>
                  <button
                    type="button"
                    onClick={() => {
                      onMuteAll();
                      close();
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <MicOff size={16} />
                    Mute all participants
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePanel("participants");
                      close();
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <Hand size={16} />
                    Manage participants
                  </button>
                </div>
              )}
            </Popover>
          </div>
        )}

        <Popover
          label="More"
          placement="top"
          align="end"
          triggerClassName={BUTTON_CLASS}
          trigger={<ButtonFace label="More" icon={Ellipsis} />}
        >
          {(close) => (
            <div className={cn(MENU_CLASS, "w-56 py-1.5")}>
              <button
                type="button"
                onClick={() => {
                  onCopyInviteLink();
                  close();
                }}
                className={MENU_ITEM_CLASS}
              >
                <Link2 size={16} />
                Copy invite link
              </button>
              <button
                type="button"
                onClick={() => {
                  onTogglePanel("agenda");
                  close();
                }}
                className={cn(MENU_ITEM_CLASS, "lg:hidden")}
              >
                <ListChecks size={16} />
                Agenda
              </button>
              <button
                type="button"
                onClick={() => {
                  onTogglePanel("notes");
                  close();
                }}
                className={cn(MENU_ITEM_CLASS, "lg:hidden")}
              >
                <NotebookPen size={16} />
                Notes
              </button>
              {media.canShareScreen && (
                <button
                  type="button"
                  onClick={() => {
                    media.toggleScreenShare();
                    close();
                  }}
                  className={cn(MENU_ITEM_CLASS, "sm:hidden")}
                >
                  <MonitorUp size={16} />
                  {media.isSharingScreen ? "Stop sharing" : "Share screen"}
                </button>
              )}
              {isHost && (
                <button
                  type="button"
                  onClick={() => {
                    onMuteAll();
                    close();
                  }}
                  className={cn(MENU_ITEM_CLASS, "sm:hidden")}
                >
                  <MicOff size={16} />
                  Mute all participants
                </button>
              )}
            </div>
          )}
        </Popover>
      </div>

      <Popover
        label={isHost ? "End meeting" : "Leave meeting"}
        placement="top"
        align="end"
        triggerClassName="flex h-11 items-center gap-2 rounded-full bg-danger px-3.5 text-sm font-medium text-white transition-colors hover:bg-danger-hover sm:px-5"
        trigger={
          <>
            <PhoneOff size={18} />
            <span className="hidden sm:inline">{isHost ? "End" : "Leave"}</span>
          </>
        }
      >
        {() => (
          <div className={cn(MENU_CLASS, "flex w-56 flex-col gap-2 p-3")}>
            {isHost && (
              <button
                type="button"
                onClick={onEndForAll}
                className="h-9 rounded-lg bg-danger text-sm font-semibold text-white hover:bg-danger-hover"
              >
                End meeting for all
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className={cn(
                "h-9 rounded-lg text-sm font-semibold",
                isHost
                  ? "bg-room-hover text-room-text hover:bg-room-line"
                  : "bg-danger text-white hover:bg-danger-hover",
              )}
            >
              Leave meeting
            </button>
          </div>
        )}
      </Popover>
    </footer>
  );
}

type ButtonFaceProps = {
  label: string;
  icon: LucideIcon;
  /** The icon to show while the device is off (microphone or camera). */
  offIcon?: LucideIcon;
  /** The device is off: the face turns red, as in most meeting apps. */
  off?: boolean;
  /** The panel or feature this control opens is showing. */
  active?: boolean;
  /** A number next to the label, e.g. how many participants. */
  count?: number;
  /** Unread chat messages, shown as a badge on the face. */
  unread?: number;
};

/** What a control looks like: a round face with an icon, and a label under it. */
function ButtonFace({ label, icon, offIcon, off, active, count, unread = 0 }: ButtonFaceProps) {
  const Icon = off && offIcon ? offIcon : icon;
  return (
    <>
      <span
        className={cn(
          "relative flex size-10 items-center justify-center rounded-full transition-colors sm:size-11",
          off
            ? "bg-room-red text-white group-hover:bg-[#e04449]"
            : active
              ? "bg-brand text-white group-hover:bg-brand-hover"
              : "bg-room-control group-hover:bg-room-line",
        )}
      >
        <Icon size={20} strokeWidth={1.9} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-room-red px-1 text-center text-[10px] leading-[18px] font-semibold text-white ring-2 ring-room-bar">
            {unread}
          </span>
        )}
      </span>
      <span className="hidden text-[11px] leading-none text-room-muted sm:block">
        {label}
        {count !== undefined && <span className="ml-1 text-room-faint">{count}</span>}
      </span>
    </>
  );
}

type ToolbarButtonProps = ButtonFaceProps & {
  onClick: () => void;
};

function ToolbarButton({ onClick, ...face }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={face.label}
      aria-pressed={face.offIcon ? undefined : Boolean(face.active)}
      onClick={onClick}
      className={BUTTON_CLASS}
    >
      <ButtonFace {...face} />
    </button>
  );
}
