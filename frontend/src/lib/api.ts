/** Typed wrapper around the backend's REST API. All network calls go through here. */

import { goToSignIn } from "./auth";
import { API_BASE_URL } from "./config";
import type {
  Meeting,
  MeetingSession,
  MeetingSummary,
  MyActionItem,
  Recap,
  ScheduleMeetingInput,
  User,
} from "./types";

export class ApiError extends Error {
  /** HTTP status code, or 0 when the server could not be reached at all. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = RequestInit & {
  /**
   * Send the browser to the sign-in page when the session is missing or has
   * expired. Off for the sign-in calls themselves, where 401 means "wrong
   * password", and for pages that also work signed out.
   */
  signInOnUnauthorized?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { signInOnUnauthorized = true, ...init } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      // Same-site requests send the sign-in cookie by default; this states it.
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && signInOnUnauthorized) {
      goToSignIn();
    }
    throw new ApiError(response.status, readErrorMessage(body, response.status));
  }
  return body as T;
}

/**
 * FastAPI reports errors as {"detail": "..."} for our own errors and as
 * {"detail": [{"msg": "..."}]} for request validation errors.
 */
function readErrorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    // Pydantic prefixes messages from custom checks with "Value error, ".
    return detail[0].msg.replace(/^Value error, /, "");
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The server is starting up. Try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}

function post<T>(path: string, body: unknown = {}, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, { ...options, method: "POST", body: JSON.stringify(body) });
}

/** Calls whose 401 answer is information, not an expired session. */
const SIGNED_OUT_OK: RequestOptions = { signInOnUnauthorized: false };

export const api = {
  // --- accounts ---
  getCurrentUser: () => request<User>("/auth/me"),
  /** The signed-in user, or an ApiError(401) without redirecting. */
  checkSession: () => request<User>("/auth/me", SIGNED_OUT_OK),
  signUp: (name: string, email: string, password: string) =>
    post<User>("/auth/signup", { name, email, password }, SIGNED_OUT_OK),
  logIn: (email: string, password: string) =>
    post<User>("/auth/login", { email, password }, SIGNED_OUT_OK),
  tryDemo: () => post<User>("/auth/demo", {}, SIGNED_OUT_OK),
  logOut: () => post<void>("/auth/logout", {}, SIGNED_OUT_OK),

  // --- meetings ---
  listUpcomingMeetings: () => request<Meeting[]>("/meetings/upcoming"),
  listRecentMeetings: () => request<Meeting[]>("/meetings/recent"),
  /** Public: anyone with the ID may look a meeting up. */
  getMeeting: (code: string) => request<Meeting>(`/meetings/${code}`, SIGNED_OUT_OK),

  createInstantMeeting: () => post<Meeting>("/meetings/instant"),
  scheduleMeeting: (input: ScheduleMeetingInput) => post<Meeting>("/meetings", input),
  updateMeeting: (code: string, input: Partial<ScheduleMeetingInput>) =>
    request<Meeting>(`/meetings/${code}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteMeeting: (code: string) => request<void>(`/meetings/${code}`, { method: "DELETE" }),

  /** Enter as the host (marks the meeting live). */
  startMeeting: (code: string) => post<MeetingSession>(`/meetings/${code}/start`),
  /** Enter as a guest with the given display name. No account needed. */
  joinMeeting: (code: string, displayName: string) =>
    post<MeetingSession>(`/meetings/${code}/join`, { display_name: displayName }, SIGNED_OUT_OK),

  // --- action items ---
  listMyActionItems: () => request<MyActionItem[]>("/action-items"),
  // Without a key the recap needs an account, so a 401 leads to sign-in.
  getRecap: (code: string, key: string | null) =>
    key
      ? request<Recap>(`/meetings/${code}/recap?key=${encodeURIComponent(key)}`, SIGNED_OUT_OK)
      : request<Recap>(`/meetings/${code}/recap`),
  /** Ask the AI provider for a summary. Takes a few seconds; host only. */
  createSummary: (code: string) => post<MeetingSummary>(`/meetings/${code}/summary`),
  setActionItemDone: (id: number, done: boolean) =>
    request<MyActionItem>(`/action-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),
};

/** Turn anything thrown into a message that is safe to show to the user. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}
