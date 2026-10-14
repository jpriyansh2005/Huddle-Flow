import { formatShortDate, formatTime, localTimeZone } from "./datetime";
import { formatMeetingCode } from "./meetingCode";
import type { Meeting } from "./types";

/** The block of text "Copy invitation" puts on the clipboard. */
export function buildInvitation(meeting: Meeting): string {
  const lines = [`${meeting.host.name} is inviting you to a HuddleFlow meeting.`, ""];
  lines.push(`Topic: ${meeting.title}`);
  if (meeting.scheduled_start) {
    const start = new Date(meeting.scheduled_start);
    lines.push(`Time: ${formatShortDate(start)} ${formatTime(start)} ${localTimeZone()}`);
  }
  lines.push("", "Join the meeting", meeting.join_url, "");
  lines.push(`Meeting ID: ${formatMeetingCode(meeting.code)}`);
  return lines.join("\n");
}

/** Copy text to the clipboard. Returns false if the browser refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
