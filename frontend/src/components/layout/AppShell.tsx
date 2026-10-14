"use client";

import { CalendarDays, House, LogOut, type LucideIcon, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { LogoMark } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

type NavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: House, href: "/" },
  { label: "Meetings", icon: CalendarDays, href: "/meetings" },
];

/** The item whose page is open: an exact match, or the section the path is in. */
function activeItem(pathname: string): NavItem | undefined {
  return (
    NAV_ITEMS.find(({ href }) => href === pathname) ??
    NAV_ITEMS.find(({ href }) => href !== "/" && pathname.startsWith(`${href}/`))
  );
}

/**
 * The frame around every dashboard page: a navy navigation rail on the left,
 * a white top bar, and the page on a light canvas. On phones the rail
 * becomes a tab bar along the bottom.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = activeItem(pathname);

  return (
    <div className="flex h-dvh bg-canvas">
      <nav
        aria-label="Main"
        className="hidden w-[76px] shrink-0 flex-col items-center gap-1.5 bg-navy py-3 md:flex"
      >
        <Link href="/" aria-label="HuddleFlow home" className="mb-3 rounded-[10px]">
          <LogoMark size={36} />
        </Link>
        <NavLinks pathname={pathname} variant="rail" />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={current?.label ?? "HuddleFlow"} />
        <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</main>
        <nav
          aria-label="Main"
          className="flex shrink-0 justify-around border-t border-line bg-white px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <NavLinks pathname={pathname} variant="tabs" />
        </nav>
      </div>
    </div>
  );
}

function TopBar({ title }: { title: string }) {
  const { user, startInstantMeeting, openJoinDialog, openScheduleDialog, signOut } = useDashboard();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-4 md:px-6">
      <Link href="/" aria-label="HuddleFlow home" className="rounded-lg md:hidden">
        <LogoMark size={30} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-navy">{title}</h1>

      <DropdownMenu
        label="New"
        triggerClassName="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        trigger={
          <>
            <Plus size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">New</span>
          </>
        }
        items={[
          { label: "New meeting", onSelect: startInstantMeeting },
          { label: "Join a meeting", onSelect: openJoinDialog },
          { label: "Schedule a meeting", onSelect: () => openScheduleDialog() },
        ]}
      />

      <DropdownMenu
        label="Profile menu"
        triggerClassName="block rounded-full"
        trigger={<Avatar name={user?.name ?? "?"} size={34} shape="circle" />}
        header={
          <div className="flex items-center gap-3">
            <Avatar name={user?.name ?? "?"} size={40} shape="circle" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user?.name ?? "Loading..."}</p>
              <p className="truncate text-[13px] text-ink-muted">{user?.email}</p>
            </div>
          </div>
        }
        items={[
          {
            label: "Sign out",
            icon: <LogOut size={16} />,
            onSelect: signOut,
          },
        ]}
      />
    </header>
  );
}

function NavLinks({ pathname, variant }: { pathname: string; variant: "rail" | "tabs" }) {
  const current = activeItem(pathname);

  return NAV_ITEMS.map((item) => {
    const { label, icon: Icon, href } = item;
    const isActive = item === current;
    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
          variant === "rail"
            ? cn(
                "h-[58px] w-[62px]",
                isActive ? "bg-white/12 text-white" : "text-navy-muted hover:bg-navy-hover hover:text-white",
              )
            : cn("h-[52px] w-20", isActive ? "text-brand" : "text-ink-muted"),
        )}
      >
        <Icon size={20} strokeWidth={isActive ? 2.25 : 1.9} />
        {label}
      </Link>
    );
  });
}
