/**
 * What the browser remembers between pages.
 *
 * The meeting session lives in sessionStorage, which is per tab. That is
 * deliberate: a second tab opened from the invite link is a different
 * participant, and refreshing a tab keeps that tab's place in the meeting.
 */

import type { MeetingSession } from "./types";

export type MediaPreferences = {
  audio: boolean;
  video: boolean;
};

export type StoredSession = MeetingSession & { media: MediaPreferences };

const SESSION_PREFIX = "huddleflow:session:";
const NAME_KEY = "huddleflow:display-name";

export function saveSession(session: MeetingSession, media: MediaPreferences): void {
  const stored: StoredSession = { ...session, media };
  sessionStorage.setItem(SESSION_PREFIX + session.meeting.code, JSON.stringify(stored));
}

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + code);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null; // storage blocked or the value is corrupt
  }
}

export function clearSession(code: string): void {
  sessionStorage.removeItem(SESSION_PREFIX + code);
}

/** The name last used to join, offered again next time. */
export function rememberedDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Remember the name for next time. An empty name forgets it. */
export function rememberDisplayName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Storage can be disabled (private mode); remembering is only a convenience.
  }
}
