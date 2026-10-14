import type { Metadata } from "next";

import { JoinByCode } from "@/components/meeting/JoinByCode";

export const metadata: Metadata = { title: "Join a meeting" };

/** /join: enter a meeting by its ID, without an account. */
export default function JoinPage() {
  return <JoinByCode />;
}
