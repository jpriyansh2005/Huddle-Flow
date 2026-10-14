"use client";

import { useEffect, useRef, useState } from "react";

import type { LocalMedia } from "@/hooks/useLocalMedia";
import type { Reaction } from "@/hooks/useMeetingRoom";
import { computeGridLayout } from "@/lib/gridLayout";
import type { RoomParticipant } from "@/lib/types";

import { VideoTile } from "./VideoTile";

const GAP = 6;

type VideoGridProps = {
  participants: RoomParticipant[];
  selfId: number | null;
  media: LocalMedia;
  remoteStreams: Map<number, MediaStream>;
  reactions: Reaction[];
  retryKey: number;
  onAutoplayBlocked: () => void;
};

/** The gallery view: equal 16:9 tiles, as large as the space allows. */
export function VideoGrid({
  participants,
  selfId,
  media,
  remoteStreams,
  reactions,
  retryKey,
  onAutoplayBlocked,
}: VideoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Recompute the layout whenever the available space changes: the window
  // is resized, a side panel opens, or a phone is rotated.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const layout = computeGridLayout(participants.length, size.width, size.height, GAP);

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div
        className="flex flex-wrap justify-center"
        style={{ gap: GAP, width: layout.columns * (layout.tileWidth + GAP) - GAP }}
      >
        {participants.map((participant) => {
          const isSelf = participant.id === selfId;
          return (
            <VideoTile
              key={participant.id}
              name={participant.display_name}
              isSelf={isSelf}
              // Our own tile reads the devices directly, so it updates
              // instantly instead of waiting for the server to echo it back.
              audioOn={isSelf ? media.audioOn : participant.audio}
              videoOn={isSelf ? media.videoOn : participant.video}
              isSharingScreen={isSelf ? media.isSharingScreen : participant.screen}
              source={
                isSelf ? media.outgoingVideoTrack : (remoteStreams.get(participant.id) ?? null)
              }
              width={layout.tileWidth}
              height={layout.tileHeight}
              reactions={reactions.filter((reaction) => reaction.participantId === participant.id)}
              retryKey={retryKey}
              onAutoplayBlocked={onAutoplayBlocked}
            />
          );
        })}
      </div>
    </div>
  );
}
