"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { PeerMesh } from "@/lib/realtime/peerMesh";
import { type CloseReason, RoomSocket } from "@/lib/realtime/roomSocket";
import { clockOffset } from "@/lib/agenda";
import type {
  ActionItem,
  ActionItemInput,
  AgendaItem,
  ChatMessage,
  LiveCaption,
  Note,
  RoomParticipant,
  ServerEvent,
} from "@/lib/types";

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
  // How many chat messages have been seen. History that arrives on joining
  // counts as seen, so a refresh does not show it all as unread again.
  const [readCount, setReadCount] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map<number, MediaStream>());
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  // Server clock minus this browser's clock, so agenda timers agree.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  // Opens the meeting's recap; shown on the screen after the meeting ends.
  const [recapKey, setRecapKey] = useState<string | null>(null);
  // Live captions: switched on by the host; the latest line per speaker.
  const [captionsOn, setCaptionsOn] = useState(false);
  const [liveCaptions, setLiveCaptions] = useState<Record<number, LiveCaption>>({});

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
        setNotes(event.notes);
        setActionItems(event.action_items);
        setMessages(event.chat);
        setReadCount(event.chat.length);
        setClockOffsetMs(clockOffset(event.server_time, Date.now()));
        setRecapKey(event.recap_key);
        setCaptionsOn(event.captions_on);
        setLiveCaptions({});
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
        setParticipants((current) => upsertById(current, event.participant));
        break;
      case "participant_updated":
        setParticipants((current) => upsertById(current, event.participant));
        break;
      case "participant_left":
        mesh?.remove(event.participant_id);
        setParticipants((current) => current.filter(({ id }) => id !== event.participant_id));
        setLiveCaptions((current) => {
          const rest = { ...current };
          delete rest[event.participant_id];
          return rest;
        });
        break;
      case "captions_updated":
        setCaptionsOn(event.enabled);
        if (!event.enabled) setLiveCaptions({});
        showToast(
          event.enabled
            ? "Captions are on. What people say is saved to the meeting transcript."
            : "Captions are off",
        );
        break;
      case "caption":
        setLiveCaptions((current) => ({
          ...current,
          [event.participant_id]: {
            participantId: event.participant_id,
            speakerName: event.speaker_name,
            text: event.text,
            final: event.final,
            updatedAt: Date.now(),
          },
        }));
        break;
      case "signal":
        void mesh?.handleSignal(event.from, event.data);
        break;
      case "agenda_updated":
        setAgenda(event.agenda);
        setClockOffsetMs(clockOffset(event.server_time, Date.now()));
        break;
      case "note_added":
        setNotes((current) => upsertById(current, event.note));
        break;
      case "note_deleted":
        setNotes((current) => current.filter(({ id }) => id !== event.note_id));
        break;
      case "action_item_saved":
        setActionItems((current) => upsertById(current, event.action_item));
        break;
      case "action_item_deleted":
        setActionItems((current) => current.filter(({ id }) => id !== event.action_item_id));
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
    readCount,
    markChatRead: (count: number) => setReadCount(count),
    notes,
    actionItems,
    reactions,
    remoteStreams,
    agenda,
    clockOffsetMs,
    recapKey,
    captionsOn,
    liveCaptions,
    sendChat: (text: string) => send({ type: "chat", text }),
    sendReaction: (emoji: string) => send({ type: "reaction", emoji }),
    // Host controls. The server ignores them from anyone who is not the host.
    muteAll: () => send({ type: "mute_all" }),
    muteParticipant: (participantId: number) =>
      send({ type: "mute_participant", participant_id: participantId }),
    removeParticipant: (participantId: number) =>
      send({ type: "remove_participant", participant_id: participantId }),
    endMeeting: () => send({ type: "end_meeting" }),
    setCaptions: (enabled: boolean) => send({ type: "captions_set", enabled }),
    sendCaption: (text: string, final: boolean) => send({ type: "caption", text, final }),
    // Agenda controls, also host only.
    agendaNext: () => send({ type: "agenda_next" }),
    agendaBack: () => send({ type: "agenda_back" }),
    agendaAdd: (title: string, minutes: number) =>
      send({ type: "agenda_add", title, duration_minutes: minutes }),
    // Notes and action items: anyone in the room.
    addNote: (text: string) => send({ type: "note_add", text }),
    deleteNote: (id: number) => send({ type: "note_delete", id }),
    addActionItem: (input: ActionItemInput) => send({ type: "action_add", ...input }),
    updateActionItem: (id: number, changes: Partial<ActionItemInput> & { done?: boolean }) => {
      // Tick the box straight away. The server's reply confirms it; if the
      // message is lost, the full room state sent on reconnect corrects it.
      const { done } = changes;
      if (done !== undefined) {
        setActionItems((current) =>
          current.map((item) => (item.id === id ? { ...item, done } : item)),
        );
      }
      send({ type: "action_update", id, ...changes });
    },
    deleteActionItem: (id: number) => send({ type: "action_delete", id }),
  };
}

/** Replace the item with the same id, or add it at the end. */
function upsertById<Item extends { id: number }>(list: Item[], item: Item): Item[] {
  return list.some(({ id }) => id === item.id)
    ? list.map((current) => (current.id === item.id ? item : current))
    : [...list, item];
}
