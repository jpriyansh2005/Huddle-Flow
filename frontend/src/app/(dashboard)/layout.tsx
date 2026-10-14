import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { ServerWakingNotice } from "@/components/dashboard/ServerWakingNotice";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Shared frame for the signed-in pages (Home and Meetings). The folder name
 * is in brackets, so it groups these pages without adding to their URLs.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <AppShell>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <ServerWakingNotice />
          {children}
        </div>
      </AppShell>
    </DashboardProvider>
  );
}
