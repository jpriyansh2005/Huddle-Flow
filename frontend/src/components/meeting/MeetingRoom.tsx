"use client";

import { Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { useMeetingRoom } from "@/hooks/useMeetingRoom";
import { copyToClipboard } from "@/lib/invitation";
import { clearSession, type StoredSession } from "@/lib/session";

import { ChatPanel } from "./ChatPanel";
import { MeetingHeader } from "./MeetingHeader";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { RoomNotice } from "./RoomNotice";
import { type SidePanel, Toolbar } from "./Toolbar";
import { VideoGrid } from "./VideoGrid";

/** Messages for the ways a meeting can be over for this participant. */
const CLOSED_NOTICES = {
  ended: { title: "This meeting has been ended by the host", message: "Thanks for joining." },
  removed: {
    title: "You have been removed from this meeting",
    message: "The host removed you from the meeting.",
  },
  replaced: {
    title: "You joined from another tab",
    message: "This meeting is now open in a different tab or window.",
  },
  invalid: {
    title: "This session is no longer valid",
    message: "Join the meeting again from its invite link.",
  },
  lost: {
    title: "Connection lost",
    message: "We couldn't reconnect you to the meeting. Check your network and join again.",
  },
};

/** The meeting screen: videos, side panels and the control bar. */
export function MeetingRoom({ session }: { session: StoredSession }) {
  const router = useRouter();
  const showToast = useToast();
  const { meeting } = session;
  const isHost = session.role === "host";

  const media = useLocalMedia(session.media);
  const room = useMeetingRoom({ code: meeting.code, token: session.session_token, media });

  const [activePanel, setActivePanel] = useState<SidePanel | null>(null);
  // How many chat messages had arrived when the chat was last looked at.
  const [seenMessages, setSeenMessages] = useState(0);
  // Sound is blocked until the user clicks something (browser autoplay rule).
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundRetryKey, setSoundRetryKey] = useState(0);

  const isChatOpen = activePanel === "chat";
  const unreadMessages = isChatOpen ? 0 : room.messages.length - seenMessages;

  // Device problems (permission denied, no camera) appear as a toast.
  const { error: mediaError, clearError: clearMediaError } = media;
  useEffect(() => {
    if (!mediaError) return;
    showToast(mediaError);
    clearMediaError();
  }, [mediaError, clearMediaError, showToast]);

  function togglePanel(panel: SidePanel) {
    setSeenMessages(room.messages.length); // opening or closing chat marks it read
    setActivePanel((current) => (current === panel ? null : panel));
  }

  async function copyInviteLink() {
    const copied = await copyToClipboard(meeting.join_url);
    showToast(copied ? "Invite link copied to clipboard" : "Couldn't copy the invite link");
  }

  function muteAll() {
    room.muteAll();
    showToast("All participants have been muted");
  }

  function leave() {
    clearSession(meeting.code);
    router.push("/");
  }

  function endForAll() {
    room.endMeeting();
    leave();
  }

  // The meeting is over for us: forget the session and show why.
  const closedNotice = CLOSED_NOTICES[room.status as keyof typeof CLOSED_NOTICES];
  const isClosed = closedNotice !== undefined;
  useEffect(() => {
    if (isClosed) clearSession(meeting.code);
  }, [isClosed, meeting.code]);

  if (closedNotice) {
    return <RoomNotice title={closedNotice.title} message={closedNotice.message} />;
  }

  return (
    <div className="flex h-dvh flex-col bg-room">
      <MeetingHeader meeting={meeting} status={room.status} />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <main className="relative flex min-w-0 flex-1">
          <VideoGrid
            participants={room.participants}
            selfId={room.selfId}
            media={media}
            remoteStreams={room.remoteStreams}
            reactions={room.reactions}
            retryKey={soundRetryKey}
            onAutoplayBlocked={() => setSoundBlocked(true)}
          />

          {soundBlocked && (
            <button
              type="button"
              onClick={() => {
                setSoundBlocked(false);
                setSoundRetryKey((key) => key + 1);
              }}
              className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-popover hover:bg-brand-hover"
            >
              <Volume2 size={16} />
              Click to hear others
            </button>
          )}
        </main>

        {activePanel === "participants" && (
          <ParticipantsPanel
            participants={room.participants}
            selfId={room.selfId}
            selfAudioOn={media.audioOn}
            selfVideoOn={media.videoOn}
            isHost={isHost}
            onClose={() => setActivePanel(null)}
            onInvite={copyInviteLink}
            onMuteAll={muteAll}
            onMute={room.muteParticipant}
            onRemove={room.removeParticipant}
          />
        )}
        {isChatOpen && (
          <ChatPanel
            messages={room.messages}
            selfId={room.selfId}
            onSend={room.sendChat}
            onClose={() => togglePanel("chat")}
          />
        )}
      </div>

      <Toolbar
        media={media}
        isHost={isHost}
        participantCount={room.participants.length}
        unreadMessages={unreadMessages}
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        onReact={room.sendReaction}
        onCopyInviteLink={copyInviteLink}
        onMuteAll={muteAll}
        onLeave={leave}
        onEndForAll={endForAll}
      />
    </div>
  );
}
