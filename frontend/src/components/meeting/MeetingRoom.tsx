"use client";

import { Volume2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { useMeetingRoom } from "@/hooks/useMeetingRoom";
import { useSpeechCaptions } from "@/hooks/useSpeechCaptions";
import { copyToClipboard } from "@/lib/invitation";
import { recapPath } from "@/lib/recap";
import { clearSession, type StoredSession } from "@/lib/session";

import { AgendaBar } from "./AgendaBar";
import { AgendaPanel } from "./AgendaPanel";
import { CaptionsOverlay } from "./CaptionsOverlay";
import { ChatPanel } from "./ChatPanel";
import { MeetingHeader } from "./MeetingHeader";
import { NotesPanel } from "./NotesPanel";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { RoomNotice } from "./RoomNotice";
import { type SidePanel, Toolbar } from "./Toolbar";
import { VideoGrid } from "./VideoGrid";

/** Messages for the ways a meeting can be over for this participant. */
const CLOSED_NOTICES = {
  ended: {
    title: "This meeting has been ended by the host",
    message: "Thanks for joining. The recap has the notes, action items and chat.",
  },
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
  // Sound is blocked until the user clicks something (browser autoplay rule).
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundRetryKey, setSoundRetryKey] = useState(0);
  // A viewer can hide the caption text for themselves; the host's switch
  // decides whether the room is captioned at all.
  const [captionsHidden, setCaptionsHidden] = useState(false);
  const speech = useSpeechCaptions({
    active: room.captionsOn && media.audioOn && room.status === "connected",
    send: room.sendCaption,
  });

  const isChatOpen = activePanel === "chat";
  const unreadMessages = isChatOpen ? 0 : room.messages.length - room.readCount;

  // Device problems (permission denied, no camera) appear as a toast.
  const { error: mediaError, clearError: clearMediaError } = media;
  useEffect(() => {
    if (!mediaError) return;
    showToast(mediaError);
    clearMediaError();
  }, [mediaError, clearMediaError, showToast]);

  /** Open a side panel (or none). Leaving or opening the chat marks it read. */
  function showPanel(panel: SidePanel | null) {
    if (panel === "chat" || activePanel === "chat") room.markChatRead(room.messages.length);
    setActivePanel(panel);
  }

  function togglePanel(panel: SidePanel) {
    showPanel(activePanel === panel ? null : panel);
  }

  async function copyInviteLink() {
    const copied = await copyToClipboard(meeting.join_url);
    showToast(copied ? "Invite link copied to clipboard" : "Couldn't copy the invite link");
  }

  function toggleCaptions() {
    if (isHost) {
      room.setCaptions(!room.captionsOn);
      setCaptionsHidden(false);
    } else if (!room.captionsOn) {
      showToast("Only the host can turn on captions");
    } else {
      setCaptionsHidden((hidden) => !hidden);
    }
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
    // The server closes everyone's room, ours included, and we then show the
    // "ended" screen with the recap link. Offline, the message cannot be
    // sent, so just leave.
    if (room.status === "connected") room.endMeeting();
    else leave();
  }

  // The meeting is over for us: forget the session and show why.
  const closedNotice = CLOSED_NOTICES[room.status as keyof typeof CLOSED_NOTICES];
  const isClosed = closedNotice !== undefined;
  useEffect(() => {
    if (isClosed) clearSession(meeting.code);
  }, [isClosed, meeting.code]);

  if (closedNotice) {
    const ended = room.status === "ended";
    return (
      <RoomNotice
        title={ended && isHost ? "You ended the meeting" : closedNotice.title}
        message={closedNotice.message}
        actions={
          ended && room.recapKey ? (
            <>
              <Link
                href={recapPath(meeting.code, room.recapKey)}
                className="flex h-11 items-center justify-center rounded-xl bg-brand text-[15px] font-medium text-white shadow-card hover:bg-brand-hover"
              >
                View the recap
              </Link>
              <Link
                href="/"
                className="flex h-11 items-center justify-center rounded-xl border border-field bg-white text-[15px] font-medium text-ink hover:bg-hover"
              >
                Back to home
              </Link>
            </>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-room">
      <MeetingHeader meeting={meeting} status={room.status} captionsOn={room.captionsOn} />
      <AgendaBar
        agenda={room.agenda}
        clockOffsetMs={room.clockOffsetMs}
        isHost={isHost}
        onNext={room.agendaNext}
        onBack={room.agendaBack}
        onOpenAgenda={() => showPanel("agenda")}
      />

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

          {room.captionsOn && (
            <CaptionsOverlay
              captions={room.liveCaptions}
              selfId={room.selfId}
              hidden={captionsHidden}
              supported={speech.supported}
              problem={speech.problem}
            />
          )}

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
            onClose={() => showPanel(null)}
            onInvite={copyInviteLink}
            onMuteAll={muteAll}
            onMute={room.muteParticipant}
            onRemove={room.removeParticipant}
          />
        )}
        {activePanel === "agenda" && (
          <AgendaPanel
            agenda={room.agenda}
            clockOffsetMs={room.clockOffsetMs}
            isHost={isHost}
            onAdd={room.agendaAdd}
            onClose={() => showPanel(null)}
          />
        )}
        {activePanel === "notes" && (
          <NotesPanel
            notes={room.notes}
            actionItems={room.actionItems}
            participants={room.participants}
            selfId={room.selfId}
            isHost={isHost}
            onAddNote={room.addNote}
            onDeleteNote={room.deleteNote}
            onAddActionItem={room.addActionItem}
            onToggleActionItem={(id, done) => room.updateActionItem(id, { done })}
            onDeleteActionItem={room.deleteActionItem}
            onClose={() => showPanel(null)}
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
        captionsActive={room.captionsOn && !captionsHidden}
        onToggleCaptions={toggleCaptions}
        onReact={room.sendReaction}
        onCopyInviteLink={copyInviteLink}
        onMuteAll={muteAll}
        onLeave={leave}
        onEndForAll={endForAll}
      />
    </div>
  );
}
