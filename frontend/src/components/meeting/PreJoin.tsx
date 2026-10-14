"use client";

import { ChevronLeft, Mic, MicOff, UserRound, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { useFetch } from "@/hooks/useFetch";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { api, errorMessage } from "@/lib/api";
import { formatMeetingCode } from "@/lib/meetingCode";
import { initials } from "@/lib/person";
import { rememberDisplayName, rememberedDisplayName, saveSession } from "@/lib/session";
import type { Meeting } from "@/lib/types";

import { MediaPlayer } from "./MediaPlayer";
import { RoomNotice } from "./RoomNotice";

/**
 * Where an invite link lands. It checks that the meeting exists, then asks
 * for a display name and shows a camera preview before joining.
 */
export function PreJoin({ code }: { code: string }) {
  // useCallback keeps the same function between renders, which useFetch
  // needs so that it only fetches again when the code changes.
  const loadMeeting = useCallback(() => api.getMeeting(code), [code]);
  const { data: meeting, error, loading } = useFetch(loadMeeting);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas text-brand">
        <Spinner className="size-7" />
      </div>
    );
  }
  if (!meeting) {
    return (
      <RoomNotice
        title="We couldn't find this meeting"
        message={error ?? "Check the meeting ID or invite link and try again."}
      />
    );
  }
  if (meeting.status === "ended") {
    return (
      <RoomNotice
        title="This meeting has ended"
        message={`"${meeting.title}" was ended by the host.`}
      />
    );
  }
  return <PreJoinForm meeting={meeting} />;
}

/**
 * A camera preview with Mute and Stop Video buttons on the left and the
 * name form on the right, the pair centred on the page.
 */
function PreJoinForm({ meeting }: { meeting: Meeting }) {
  const router = useRouter();
  const media = useLocalMedia({ audio: false, video: true });
  const [name, setName] = useState(rememberedDisplayName);
  const [rememberName, setRememberName] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  // A signed-in visitor gets their account name suggested. Guests have no
  // session; that is fine and nothing is shown.
  useEffect(() => {
    let cancelled = false;
    api
      .checkSession()
      .then((user) => {
        if (!cancelled) setName((current) => current || user.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const displayName = name.trim();
    if (!displayName) return;

    setIsJoining(true);
    setError(null);
    try {
      const session = await api.joinMeeting(meeting.code, displayName);
      // An unticked box forgets any name remembered earlier.
      rememberDisplayName(rememberName ? displayName : "");
      // Carry the choices made here (mic and camera on or off) into the room.
      saveSession(session, { audio: media.audioOn, video: media.videoOn });
      router.push(`/meeting/${meeting.code}`);
    } catch (joinError) {
      setError(errorMessage(joinError));
      setIsJoining(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6 sm:px-10">
        <Link href="/" aria-label="HuddleFlow home" className="rounded-md">
          <Logo size={30} />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-brand hover:underline"
        >
          <ChevronLeft size={15} />
          Back
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="grid w-full max-w-[1136px] items-center gap-9 lg:grid-cols-[minmax(0,700px)_400px]">
          <section aria-label="Camera preview" className="mx-auto w-full max-w-[700px]">
            <div className="relative aspect-[700/394] overflow-hidden rounded-2xl bg-room-tile shadow-card">
              <MediaPlayer source={media.cameraTrack} muted mirrored hidden={!media.videoOn} />
              {!media.videoOn && (
                <div className="absolute inset-0 flex items-center justify-center pb-10">
                  <span className="flex size-[30%] max-h-[150px] max-w-[150px] items-center justify-center rounded-full bg-room-control text-[40px] font-semibold text-room-muted">
                    {name.trim() ? initials(name) : <UserRound className="size-1/2" strokeWidth={1.4} />}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-3 flex justify-center">
                <PreviewToggle
                  label={media.audioOn ? "Mute" : "Unmute"}
                  icon={media.audioOn ? <Mic size={22} /> : <MicOff size={22} className="text-room-red" />}
                  onClick={media.toggleAudio}
                  className="rounded-l-[10px]"
                />
                <PreviewToggle
                  label={media.videoOn ? "Stop Video" : "Start Video"}
                  icon={
                    media.videoOn ? <Video size={22} /> : <VideoOff size={22} className="text-room-red" />
                  }
                  onClick={media.toggleVideo}
                  className="rounded-r-[10px]"
                />
              </div>
            </div>
            {media.error && (
              <p role="alert" className="mt-3 text-center text-[13px] text-ink-muted">
                {media.error} You can still join without it.
              </p>
            )}
          </section>

          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[400px]">
            <h1 className="text-center text-2xl font-semibold tracking-tight text-navy">Ready to join?</h1>

            <label htmlFor="prejoin-name" className="mt-5 mb-1.5 block text-sm font-medium">
              Your name
            </label>
            <input
              id="prejoin-name"
              autoFocus
              maxLength={64}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 w-full rounded-xl border border-field bg-white px-3.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
            {error && (
              <p role="alert" className="mt-2 text-[13px] text-danger">
                {error}
              </p>
            )}

            <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={rememberName}
                onChange={(event) => setRememberName(event.target.checked)}
                className="size-4 accent-brand"
              />
              Remember my name for future meetings
            </label>

            <Button
              type="submit"
              size="lg"
              disabled={!name.trim() || isJoining}
              className="mt-3.5 w-full font-bold"
            >
              {isJoining ? <Spinner className="size-4" /> : "Join"}
            </Button>

            <p className="mt-4 text-sm leading-relaxed">
              By clicking &quot;Join&quot;, you agree that others in the meeting can see and hear
              you.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              You are joining <span className="text-ink">{meeting.title}</span>, hosted by{" "}
              {meeting.host.name}. Meeting ID: {formatMeetingCode(meeting.code)}
            </p>
          </form>
        </div>
      </main>

      <footer className="pb-6 text-center text-[12px] text-ink-muted">
        HuddleFlow &middot; Meetings that end with a plan
      </footer>
    </div>
  );
}

type PreviewToggleProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className?: string;
};

/** One of the two black buttons under the preview: an icon with its label below. */
function PreviewToggle({ label, icon, onClick, className }: PreviewToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[52px] w-[88px] flex-col items-center justify-center gap-0.5 bg-room/90 text-[12px] text-room-text hover:bg-room-hover ${className ?? ""}`}
    >
      {icon}
      {label}
    </button>
  );
}
