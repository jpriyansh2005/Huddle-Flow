/** Helpers for the sign-in pages. */

const SIGN_IN_PATHS = ["/login", "/signup"];

/**
 * Where to go after signing in. The `next` value comes from the address bar,
 * so it is only trusted when it is a path on this site: "/meetings" is fine,
 * "https://evil.example" or "//evil.example" (another site) is not.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  if (SIGN_IN_PATHS.some((path) => next === path || next.startsWith(`${path}?`))) {
    return "/";
  }
  return next;
}

/** The sign-in page address that comes back to `path` afterwards. */
export function signInPath(path: string): string {
  const next = safeNextPath(path);
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

/** Send the browser to the sign-in page, unless it is already on one. */
export function goToSignIn(): void {
  const { pathname, search } = window.location;
  if (SIGN_IN_PATHS.includes(pathname)) return;
  window.location.assign(signInPath(pathname + search));
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MIN_PASSWORD_LENGTH = 8;

/** The same check the backend makes, so mistakes are shown before sending. */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}
