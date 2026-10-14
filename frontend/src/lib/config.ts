/** Where the FastAPI backend lives. Set NEXT_PUBLIC_API_URL when deploying. */
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/**
 * REST calls go to this site's own /api path, which next.config.ts forwards
 * to the backend, so the sign-in cookie is first-party.
 */
export const API_BASE_URL = "/api/v1";

/**
 * WebSockets cannot be forwarded that way, so the meeting room connects to
 * the backend directly: http -> ws and https -> wss. It authenticates with
 * the meeting's own token, not the cookie.
 */
export const WS_BASE_URL = API_ORIGIN.replace(/^http/, "ws");

/** Name of the sign-in cookie. Must match SESSION_COOKIE_NAME on the backend. */
export const SESSION_COOKIE = "hf_session";

/**
 * Servers that help two browsers find a direct route to each other.
 * Google's public STUN server is enough for most home and office networks.
 */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
