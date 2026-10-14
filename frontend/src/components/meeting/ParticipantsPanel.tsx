"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { RoomParticipant } from "@/lib/types";

import { SidePanelFrame } from "./SidePanelFrame";

type ParticipantsPanelProps = {
  participants: RoomParticipant[];
  selfId: number | null;
  /** Our own live device state, which is newer than the server's copy. */
  selfAudioOn: boolean;
  selfVideoOn: boolean;
  isHost: boolean;
  onClose: () => void;
  onInvite: () => void;
  onMuteAll: () => void;
  onMute: (participantId: number) => void;
  onRemove: (participantId: number) => void;
};

/** Who is in the meeting. The host also gets mute and remove controls. */
export function ParticipantsPanel({
  participants,
  selfId,
  selfAudioOn,
  selfVideoOn,
  isHost,
  onClose,
  onInvite,
  onMuteAll,
  onMute,
  onRemove,
}: ParticipantsPanelProps) {
  const [pendingRemoval, setPendingRemoval] = useState<RoomParticipant | null>(null);

  // You first, then the host, then everyone else.
  const ordered = [...participants].sort((a, b) => rank(a, selfId) - rank(b, selfId));

  return (
    <SidePanelFrame
      title={`People (${participants.length})`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onInvite} className="flex-1">
            Invite
          </Button>
          {isHost && (
            <Button variant="outline" size="sm" onClick={onMuteAll} className="flex-1">
              Mute all
            </Button>
          )}
        </div>
      }
    >
      <ul className="py-1.5">
        {ordered.map((participant) => {
          const isSelf = participant.id === selfId;
          const audioOn = isSelf ? selfAudioOn : participant.audio;
          const videoOn = isSelf ? selfVideoOn : participant.video;
          const tags = [participant.role === "host" && "Host", isSelf && "me"].filter(Boolean);
          const canBeManaged = isHost && !isSelf;

          return (
            <li
              key={participant.id}
              className="group flex min-h-12 items-center gap-2.5 px-4 py-1.5 hover:bg-hover"
            >
              <Avatar name={participant.display_name} size={32} />
              <p className="min-w-0 flex-1 truncate text-sm">
                {participant.display_name}
                {tags.length > 0 && <span className="text-ink-muted"> ({tags.join(", ")})</span>}
              </p>

              {canBeManaged && (
                // Shown on hover or keyboard focus; always shown on touch
                // screens, where there is no hover.
                <div className="hidden shrink-0 gap-1.5 group-focus-within:flex group-hover:flex [@media(hover:none)]:flex">
                  {audioOn && (
                    <Button size="sm" onClick={() => onMute(participant.id)} className="h-7 px-2.5">
                      Mute
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPendingRemoval(participant)}
                    className="h-7 px-2.5 text-danger hover:text-danger"
                  >
                    Remove
                  </Button>
                </div>
              )}

              <div className="flex shrink-0 items-center gap-2 text-ink-muted">
                {audioOn ? (
                  <Mic size={17} aria-label="Unmuted" />
                ) : (
                  <MicOff size={17} className="text-danger" aria-label="Muted" />
                )}
                {videoOn ? (
                  <Video size={17} aria-label="Video on" />
                ) : (
                  <VideoOff size={17} className="text-danger" aria-label="Video off" />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pendingRemoval && (
        <Modal
          title="Remove participant"
          onClose={() => setPendingRemoval(null)}
          widthClassName="max-w-[400px]"
        >
          <p className="text-sm text-ink-muted">
            Remove <span className="font-bold text-ink">{pendingRemoval.display_name}</span> from
            the meeting? They won&apos;t be able to rejoin with the same session.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onRemove(pendingRemoval.id);
                setPendingRemoval(null);
              }}
            >
              Remove
            </Button>
          </div>
        </Modal>
      )}
    </SidePanelFrame>
  );
}

function rank(participant: RoomParticipant, selfId: number | null): number {
  if (participant.id === selfId) return 0;
  if (participant.role === "host") return 1;
  return 2;
}
