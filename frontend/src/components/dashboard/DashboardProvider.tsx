"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useMeetingLauncher } from "@/hooks/useMeetingLauncher";
import { api, errorMessage } from "@/lib/api";
import { buildInvitation, copyToClipboard } from "@/lib/invitation";
import type { Meeting, User } from "@/lib/types";

import { DeleteMeetingDialog } from "./DeleteMeetingDialog";
import { JoinMeetingDialog } from "./JoinMeetingDialog";
import { MeetingScheduledDialog } from "./MeetingScheduledDialog";
import { ScheduleMeetingDialog } from "./ScheduleMeetingDialog";

type DashboardData = {
  user: User;
  upcoming: Meeting[];
  recent: Meeting[];
};

/** Which dialog is open. Only one can be open at a time. */
type OpenDialog =
  | { kind: "join" }
  | { kind: "schedule"; meeting?: Meeting } // with a meeting: edit it
  | { kind: "scheduled"; meeting: Meeting }
  | { kind: "delete"; meeting: Meeting }
  | null;

type DashboardContextValue = {
  user: User | null;
  upcoming: Meeting[];
  recent: Meeting[];
  loading: boolean;
  error: string | null;
  reload: () => void;

  isLaunching: boolean;
  startInstantMeeting: () => void;
  startMeeting: (meeting: Meeting) => void;

  openJoinDialog: () => void;
  openScheduleDialog: (meetingToEdit?: Meeting) => void;
  openDeleteDialog: (meeting: Meeting) => void;
  copyInvitation: (meeting: Meeting) => void;

  signOut: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

// Defined outside the component so useFetch gets the same function every render.
async function loadDashboard(): Promise<DashboardData> {
  const [user, upcoming, recent] = await Promise.all([
    api.getCurrentUser(),
    api.listUpcomingMeetings(),
    api.listRecentMeetings(),
  ]);
  return { user, upcoming, recent };
}

/**
 * Holds what every dashboard page shares: the user, the meeting lists, the
 * dialogs and the actions on a meeting. Pages read it with `useDashboard()`.
 */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useFetch(loadDashboard);
  const { isLaunching, startInstantMeeting, startMeeting } = useMeetingLauncher();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const showToast = useToast();
  const router = useRouter();

  // Refresh the lists when the user comes back to this tab, for example
  // after hosting a meeting in another one.
  const reloadOnFocus = useEffectEvent(reload);
  useEffect(() => {
    const handleFocus = () => reloadOnFocus();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const closeDialog = () => setDialog(null);

  async function copyInvitation(meeting: Meeting) {
    const copied = await copyToClipboard(buildInvitation(meeting));
    showToast(copied ? "Invitation copied to clipboard" : "Couldn't copy the invitation");
  }

  async function signOut() {
    try {
      await api.logOut();
    } catch (error) {
      // Offline, for example. Staying signed in is safer than pretending.
      showToast(errorMessage(error));
      return;
    }
    router.replace("/login");
  }

  const value: DashboardContextValue = {
    user: data?.user ?? null,
    upcoming: data?.upcoming ?? [],
    recent: data?.recent ?? [],
    loading,
    error,
    reload,
    isLaunching,
    startInstantMeeting,
    startMeeting: (meeting) => startMeeting(meeting.code),
    openJoinDialog: () => setDialog({ kind: "join" }),
    openScheduleDialog: (meeting) => setDialog({ kind: "schedule", meeting }),
    openDeleteDialog: (meeting) => setDialog({ kind: "delete", meeting }),
    copyInvitation,
    signOut,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}

      {dialog?.kind === "join" && (
        <JoinMeetingDialog defaultName={data?.user.name ?? ""} onClose={closeDialog} />
      )}
      {dialog?.kind === "schedule" && (
        <ScheduleMeetingDialog
          meeting={dialog.meeting}
          onClose={closeDialog}
          onSaved={(meeting, wasEdit) => {
            reload();
            if (wasEdit) {
              closeDialog();
              showToast("Meeting updated");
            } else {
              setDialog({ kind: "scheduled", meeting });
            }
          }}
        />
      )}
      {dialog?.kind === "scheduled" && (
        <MeetingScheduledDialog meeting={dialog.meeting} onClose={closeDialog} />
      )}
      {dialog?.kind === "delete" && (
        <DeleteMeetingDialog
          meeting={dialog.meeting}
          onClose={closeDialog}
          onDeleted={() => {
            closeDialog();
            reload();
            showToast("Meeting deleted");
          }}
        />
      )}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const value = useContext(DashboardContext);
  if (!value) {
    throw new Error("useDashboard must be used inside <DashboardProvider>.");
  }
  return value;
}
