import type { Metadata } from "next";
import { Suspense } from "react";

import { RecapSkeleton, RecapView } from "@/components/recap/RecapView";

export const metadata: Metadata = { title: "Meeting recap" };

/**
 * /recap/{code}: what a meeting produced. Open to its host and signed-in
 * attendees, and to anyone with the share link (?key=...).
 */
export default async function RecapPage({ params }: PageProps<"/recap/[code]">) {
  const { code } = await params;
  // RecapView reads ?key= from the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<RecapSkeleton />}>
      <RecapView code={code} />
    </Suspense>
  );
}
