import type { Metadata } from "next";

import { ActionItemsView } from "@/components/dashboard/ActionItemsView";

export const metadata: Metadata = { title: "Action items" };

export default function ActionItemsPage() {
  return <ActionItemsView />;
}
