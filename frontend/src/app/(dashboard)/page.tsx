import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionTiles } from "@/components/dashboard/ActionTiles";
import { HomeHeader } from "@/components/dashboard/HomeHeader";
import { RecentMeetings } from "@/components/dashboard/RecentMeetings";
import { UpcomingPanel } from "@/components/dashboard/UpcomingPanel";
import { Card, CARD_FOOTER_LINK } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Home" };

/** How many past meetings the home screen lists before "View all". */
const RECENT_ON_HOME = 4;

/** The home screen: greeting and clock, the quick actions, then the two meeting lists. */
export default function HomePage() {
  return (
    <div className="space-y-6">
      <HomeHeader />

      <section aria-label="Meeting actions">
        <ActionTiles />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <UpcomingPanel />
        <Card
          title="Recent meetings"
          titleId="recent-heading"
          footer={
            <Link href="/meetings?tab=previous" className={CARD_FOOTER_LINK}>
              View all
              <ChevronRight size={14} />
            </Link>
          }
        >
          <RecentMeetings limit={RECENT_ON_HOME} />
        </Card>
      </div>
    </div>
  );
}
