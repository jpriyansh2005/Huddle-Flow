"use client";

import { MicOff } from "lucide-react";

import type { Reaction } from "@/hooks/useMeetingRoom";

import { MediaPlayer } from "./MediaPlayer";

type VideoTileProps = {
  name: string;
  isSelf: boolean;
  audioOn: boolean;
  /** Whether a camera picture should be visible. */
  videoOn: boolean;
  isSharingScreen: boolean;
  source: MediaStream | MediaStreamTrack | null;
  width: number;
  height: number;
  reactions: Reaction[];
  retryKey: number;
  onAutoplayBlocked: () => void;
};

/**
 * One person in the gallery. With the camera off, the person's name is
 * shown in the middle of the dark tile.
 */
export function VideoTile({
  name,
  isSelf,
  audioOn,
  videoOn,
  isSharingScreen,
  source,
  width,
  height,
  reactions,
  retryKey,
  onAutoplayBlocked,
}: VideoTileProps) {
  const showsPicture = videoOn || isSharingScreen;

  return (
    <div className="relative overflow-hidden rounded-xl bg-room-tile" style={{ width, height }}>
      <MediaPlayer
        source={source}
        muted={isSelf}
        mirrored={isSelf && !isSharingScreen}
        fit={isSharingScreen ? "contain" : "cover"}
        hidden={!showsPicture}
        retryKey={retryKey}
        onAutoplayBlocked={onAutoplayBlocked}
      />

      {!showsPicture && (
        <p
          className="absolute inset-0 flex items-center justify-center px-6 text-center font-medium text-white"
          // Scale the name with the tile, within sensible limits.
          style={{ fontSize: Math.max(16, Math.min(height * 0.11, 34)) }}
        >
          <span className="line-clamp-2">{name}</span>
        </p>
      )}

      <div className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-lg bg-[#17181a]/90 px-2 py-1 text-[13px] leading-5 font-semibold text-white">
        {!audioOn && <MicOff size={14} className="shrink-0 text-room-red" aria-label="Muted" />}
        <span className="truncate">{name}</span>
      </div>

      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          aria-hidden
          className="absolute bottom-10 left-4 animate-float-up text-4xl"
        >
          {reaction.emoji}
        </span>
      ))}
    </div>
  );
}
