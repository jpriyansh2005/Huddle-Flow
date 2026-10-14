/** Shapes of the JSON the backend sends. They mirror backend/app/schemas. */

export type User = {
  id: number;
  name: string;
  email: string;
};

export type MeetingKind = "instant" | "scheduled";
export type MeetingStatus = "scheduled" | "live" | "ended";
export type ParticipantRole = "host" | "participant";

/** One topic on a meeting's agenda. The times say what really happened. */
export type AgendaItem = {
  id: number;
  position: number;
  title: string;
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
};

export type AgendaItemInput = {
  title: string;
  duration_minutes: number;
};

export type Meeting = {
  id: number;
  /** The public 11-digit meeting ID. */
  code: string;
  title: string;
  description: string | null;
  kind: MeetingKind;
  status: MeetingStatus;
  /** ISO 8601 timestamps in UTC. */
  scheduled_start: string | null;
  duration_minutes: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  host: User;
  join_url: string;
  agenda: AgendaItem[];
};

export type ScheduleMeetingInput = {
  title: string;
  description?: string | null;
  scheduled_start: string;
  duration_minutes: number;
  /** Sent in full; on an edit it replaces the old agenda. */
  agenda?: AgendaItemInput[];
};

/** Returned when entering a meeting: who you are in it and the secret that proves it. */
export type MeetingSession = {
  participant_id: number;
  session_token: string;
  role: ParticipantRole;
  display_name: string;
  meeting: Meeting;
};

/** A person currently connected to a meeting room. */
export type RoomParticipant = {
  id: number;
  display_name: string;
  role: ParticipantRole;
  audio: boolean;
  video: boolean;
  screen: boolean;
};

export type ChatMessage = {
  id: number;
  /** The sender's participant id; null if their attendance record is gone. */
  sender_id: number | null;
  sender_name: string;
  text: string;
  sent_at: string;
};

/** A shared note written during a meeting. */
export type Note = {
  id: number;
  author_participant_id: number | null;
  author_name: string;
  text: string;
  created_at: string;
};

/** A task agreed in a meeting. */
export type ActionItem = {
  id: number;
  text: string;
  owner_name: string | null;
  owner_user_id: number | null;
  /** A calendar day, "2026-10-20", with no time or time zone. */
  due_date: string | null;
  done: boolean;
  created_by_participant_id: number | null;
  created_at: string;
};

export type ActionItemInput = {
  text: string;
  owner_participant_id?: number | null;
  owner_name?: string | null;
  due_date?: string | null;
};

/** One person in a meeting's recap, with all their visits added together. */
export type Attendee = {
  name: string;
  is_host: boolean;
  first_joined_at: string;
  seconds_present: number;
};

/** One finished sentence of live captions, kept in the meeting's transcript. */
export type TranscriptLine = {
  id: number;
  participant_id: number | null;
  speaker_name: string;
  text: string;
  spoken_at: string;
};

/** The AI-written summary of a meeting. */
export type MeetingSummary = {
  overview: string;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
  /** The model that wrote it. */
  model: string;
  created_at: string;
};

/** What someone is saying right now, as shown over the videos. */
export type LiveCaption = {
  participantId: number;
  speakerName: string;
  text: string;
  /** False while the speaker is still in the middle of the sentence. */
  final: boolean;
  /** When it last changed, in this browser's clock (ms). */
  updatedAt: number;
};

/** Everything a meeting produced, for the recap page. */
export type Recap = {
  meeting: Meeting;
  attendees: Attendee[];
  notes: Note[];
  action_items: ActionItem[];
  /** The latest messages; `chat_total` says how many were sent in all. */
  chat: ChatMessage[];
  chat_total: number;
  /** The latest transcript lines; `transcript_total` says how many there are. */
  transcript: TranscriptLine[];
  transcript_total: number;
  summary: MeetingSummary | null;
  /** Whether the server can write summaries (it has an AI provider key). */
  summaries_enabled: boolean;
  viewer: { is_host: boolean; signed_in: boolean };
  /** The link anyone can open. Only the host receives it. */
  share_url: string | null;
};

/** An action item on the signed-in user's own list. */
export type MyActionItem = ActionItem & {
  meeting: { code: string; title: string; started_at: string | null; ended_at: string | null };
  assigned_to_me: boolean;
};

/** WebRTC handshake data relayed between two browsers. */
export type SignalData =
  { description: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

/** Messages the server pushes over the meeting WebSocket. */
export type ServerEvent =
  | {
      type: "room_state";
      self_id: number;
      participants: RoomParticipant[];
      agenda: AgendaItem[];
      notes: Note[];
      action_items: ActionItem[];
      chat: ChatMessage[];
      /** Opens the recap after the meeting, for everyone who attended. */
      recap_key: string;
      captions_on: boolean;
      server_time: string;
    }
  | { type: "captions_updated"; enabled: boolean }
  | {
      type: "caption";
      participant_id: number;
      speaker_name: string;
      text: string;
      final: boolean;
    }
  | { type: "agenda_updated"; agenda: AgendaItem[]; server_time: string }
  | { type: "note_added"; note: Note }
  | { type: "note_deleted"; note_id: number }
  | { type: "action_item_saved"; action_item: ActionItem }
  | { type: "action_item_deleted"; action_item_id: number }
  | { type: "participant_joined"; participant: RoomParticipant }
  | { type: "participant_updated"; participant: RoomParticipant }
  | { type: "participant_left"; participant_id: number; reason?: "removed" }
  | { type: "chat"; message: ChatMessage }
  | { type: "reaction"; participant_id: number; emoji: string }
  | { type: "signal"; from: number; data: SignalData }
  | { type: "force_mute" }
  | { type: "removed" }
  | { type: "meeting_ended" }
  | { type: "error"; message: string };

/** Messages the browser sends over the meeting WebSocket. */
export type ClientEvent =
  | { type: "media_state"; audio: boolean; video: boolean; screen: boolean }
  | { type: "chat"; text: string }
  | { type: "reaction"; emoji: string }
  | { type: "signal"; to: number; data: SignalData }
  | { type: "mute_all" }
  | { type: "mute_participant"; participant_id: number }
  | { type: "remove_participant"; participant_id: number }
  | { type: "end_meeting" }
  | { type: "agenda_next" }
  | { type: "agenda_back" }
  | { type: "agenda_add"; title: string; duration_minutes: number }
  | { type: "note_add"; text: string }
  | { type: "note_delete"; id: number }
  | ({ type: "action_add" } & ActionItemInput)
  | ({ type: "action_update"; id: number; done?: boolean } & Partial<ActionItemInput>)
  | { type: "action_delete"; id: number }
  | { type: "captions_set"; enabled: boolean }
  | { type: "caption"; text: string; final: boolean };
