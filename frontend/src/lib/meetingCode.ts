/** Helpers for the 11-digit meeting ID. */

const INVITE_LINK_PATTERN = /\/j\/(\d+)/;
const MIN_LENGTH = 9;
const MAX_LENGTH = 11;

/** "86412345678" -> "864 1234 5678": easier to read and to type. */
export function formatMeetingCode(code: string): string {
  if (code.length !== MAX_LENGTH) {
    return code;
  }
  return `${code.slice(0, 3)} ${code.slice(3, 7)} ${code.slice(7)}`;
}

/**
 * Read a meeting ID from whatever the user typed or pasted: a plain ID, an
 * ID with spaces or dashes, or a full invite link.
 * Returns null when the text cannot be a meeting ID.
 */
export function parseMeetingInput(input: string): string | null {
  const linkMatch = input.match(INVITE_LINK_PATTERN);
  const digits = linkMatch ? linkMatch[1] : input.replace(/[\s-]/g, "");
  const looksValid =
    /^\d+$/.test(digits) && digits.length >= MIN_LENGTH && digits.length <= MAX_LENGTH;
  return looksValid ? digits : null;
}
