/** Helpers for showing a person when they have no picture. */

const AVATAR_COLORS = [
  "#3b4fe0",
  "#0fa88f",
  "#7c3aed",
  "#db2777",
  "#c2410c",
  "#0284c7",
  "#059669",
  "#4f46e5",
];

/** "Alex Morgan" -> "AM", "priya" -> "P" */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Pick a colour from the name, so the same person always gets the same one. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
