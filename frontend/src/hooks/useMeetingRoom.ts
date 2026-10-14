"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { PeerMesh } from "@/lib/realtime/peerMesh";
import { type CloseReason, RoomSocket } from "@/lib/realtime/roomSocket";
import { clockOffset } from "@/lib/agenda";
import type { AgendaItem, ChatMessage, RoomParticipant, ServerEvent } from "@/lib/types";

import type { LocalMedia } from "./useLocalMedia";

export type RoomStatus = "connecting" | "connected" | "reconnecting" | CloseReason;

export type Reaction = { id: number; participantId: number; emoji: string };

const REACTION_VISIBLE_MS = 3500;
let nextReactionId = 1;

type UseMeetingRoomOptions = {
  code: string;
  token: string;
  media: LocalMedia;
};

/**
 * Everything live about one meeting: who is in it, the chat, reactions and
 * other people's audio and video. It owns the WebSocket and the WebRTC
 * connections and turns server events into React state.
 */
export function useMeetingRoom({ code, token, media }: UseMeetingRoomOptions) {
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [selfId, setSelfId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map<number, MediaStream>());
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  // Server clock minus this browser's clock, so agenda timers agree.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const socketRef = useRef<RoomSocket | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const showToast = useToast();

  // useEffectEvent: the socket is created once, but this handler always
  // sees the latest state and props when a message arrives.
  const handleEvent = useEffectEvent((event: ServerEvent) => {
    const mesh = meshRef.current;

    switch (event.type) {
      case "room_state": {
        // Sent on every (re)connection. Start from a clean slate and call
        // everyone who is already here.
        setSelfId(event.self_id);
        setParticipants(event.participants);
        setAgenda(event.agenda);
        setClockOffsetMs(clockOffset(event.server_time, Date.now()));
        setStatus("connected");
        mesh?.closeAll();
        mesh?.setLocalTrack("audio", media.audioTrack);
        mesh?.setLocalTrack("video", media.outgoingVideoTrack);
        for (const participant of event.participants) {
          if (participant.id !== event.self_id) void mesh?.call(participant.id);
        }
        break;
      }
      case "participant_joined":
        // The newcomer will call us, so drop any old connection to them.
        mesh?.remove(event.participant.id);
        setParticipants((current) => upsert(current, event.participant));
        break;
      case "participant_updated":
        setParticipants((current) => upsert(current, event.participant));
        break;
      case "participant_left":
        mesh?.remove(event.participant_id);
        setParticipants((current) => current.filter(({ id }) => id !== event.participant_id));
        break;
      case "signal":
        void mesh?.handleSignal(event.from, event.data);
        break;
      case "agenda_updated":
        setAgenda(event.agenda);
        setClockOffsetMs(clockOffset(event.server_time, Date.now()));
        break;
      case "chat":
        setMessages((current) => [...current, event.message]);
        break;
      case "reaction": {
        const reaction = {
          id: nextReactionId++,
          participantId: event.participant_id,
          emoji: event.emoji,
        };
        setReactions((current) => [...current, reaction]);
        setTimeout(() => {
          setReactions((current) => current.filter(({ id }) => id !== reaction.id));
        }, REACTION_VISIBLE_MS);
        break;
      }
      case "force_mute":
        media.turnAudioOff();
        showToast("The host muted you");
        break;
      case "error":
        showToast(event.message);
        break;
      case "removed":
      case "meeting_ended":
        // The server closes the socket right after these; the close code
        // sets the final status in onClosed below.
        break;
    }
  });

  // Connect when the room opens; disconnect when it closes.
  useEffect(() => {
    const mesh = new PeerMesh({
      sendSignal: (to, data) => socketRef.current?.send({ type: "signal", to, data }),
      onStreamsChanged: setRemoteStreams,
    });
    const socket = new RoomSocket({
      code,
      token,
      onEvent: handleEvent,
      onReconnecting: () => setStatus("reconnecting"),
      onClosed: (reason) => {
        mesh.closeAll();
        setStatus(reason);
      },
    });
    meshRef.current = mesh;
    socketRef.current = socket;

    return () => {
      socket.close();
      mesh.closeAll();
    };
  }, [code, token]);

  // Send the current microphone / camera / screen track to everyone.
  useEffect(() => {
    meshRef.current?.setLocalTrack("audio", media.audioTrack);
  }, [media.audioTrack]);

  useEffect(() => {
    meshRef.current?.setLocalTrack("video", media.outgoingVideoTrack);
  }, [media.outgoingVideoTrack]);

  // Tell the room whether we are muted, on camera or sharing, so other
  // people's screens can show the right icons.
  useEffect(() => {
    if (status !== "connected") return;
    socketRef.current?.send({
      type: "media_state",
      audio: media.audioOn,
      video: media.videoOn,
      screen: media.isSharingScreen,
    });
  }, [status, media.audioOn, media.videoOn, media.isSharingScreen]);

  const send = (event: Parameters<RoomSocket["send"]>[0]) => socketRef.current?.send(event);

  return {
    status,
    selfId,
    participants,
    messages,
    reactions,
    remoteStreams,
    agenda,
    clockOffsetMs,
    sendChat: (text: string) => send({ type: "chat", text }),
    sendReaction: (emoji: string) => send({ type: "reaction", emoji }),
    // Host controls. The server ignores them from anyone who is not the host.
    muteAll: () => send({ type: "mute_all" }),
    muteParticipant: (participantId: number) =>
      send({ type: "mute_participant", participant_id: participantId }),
    removeParticipant: (participantId: number) =>
      send({ type: "remove_participant", participant_id: participantId }),
    endMeeting: () => send({ type: "end_meeting" }),
    // Agenda controls, also host only.
    agendaNext: () => send({ type: "agenda_next" }),
    agendaBack: () => send({ type: "agenda_back" }),
    agendaAdd: (title: string, minutes: number) =>
      send({ type: "agenda_add", title, duration_minutes: minutes }),
  };
}

/** Replace the participant with the same id, or add them at the end. */
function upsert(list: RoomParticipant[], participant: RoomParticipant): RoomParticipant[] {
  const exists = list.some(({ id }) => id === participant.id);
  return exists
    ? list.map((current) => (current.id === participant.id ? participant : current))
    : [...list, participant];
}
