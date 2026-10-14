"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, inputClassName } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { parseMeetingInput } from "@/lib/meetingCode";
import { rememberDisplayName, rememberedDisplayName, saveSession } from "@/lib/session";

type JoinMeetingDialogProps = {
  /** Suggested display name when none has been used before. */
  defaultName: string;
  onClose: () => void;
};

/**
 * The "Join meeting" dialog: a meeting ID or invite link, the name to show
 * in the meeting, and whether to start with the microphone and camera off.
 */
export function JoinMeetingDialog({ defaultName, onClose }: JoinMeetingDialogProps) {
  const router = useRouter();
  const [meetingInput, setMeetingInput] = useState("");
  const [name, setName] = useState(() => rememberedDisplayName() || defaultName);
  const [muteAudio, setMuteAudio] = useState(true);
  const [turnOffVideo, setTurnOffVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const canSubmit = meetingInput.trim() !== "" && name.trim() !== "" && !isJoining;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const code = parseMeetingInput(meetingInput);
    if (!code) {
      setError("Enter a valid meeting ID or invite link.");
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      // The server checks that the meeting exists and has not ended; an
      // unknown ID comes back as an error and is shown under the field.
      const session = await api.joinMeeting(code, name.trim());
      rememberDisplayName(name.trim());
      saveSession(session, { audio: !muteAudio, video: !turnOffVideo });
      router.push(`/meeting/${code}`);
    } catch (joinError) {
      setError(errorMessage(joinError));
      setIsJoining(false);
    }
  }

  return (
    <Modal title="Join a meeting" onClose={onClose} widthClassName="max-w-[448px]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Meeting ID or Personal Link Name" htmlFor="join-meeting-id" error={error}>
          <input
            id="join-meeting-id"
            autoFocus
            inputMode="text"
            autoComplete="off"
            placeholder="Enter meeting ID or invite link"
            value={meetingInput}
            onChange={(event) => {
              setMeetingInput(event.target.value);
              setError(null);
            }}
            className={inputClassName}
          />
        </Field>

        <Field label="Your name" htmlFor="join-display-name">
          <input
            id="join-display-name"
            maxLength={64}
            placeholder="Enter your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClassName}
          />
        </Field>

        <div className="space-y-2.5 pt-1">
          <Checkbox label="Don't connect to audio" checked={muteAudio} onChange={setMuteAudio} />
          <Checkbox label="Turn off my video" checked={turnOffVideo} onChange={setTurnOffVideo} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} className="min-w-20">
            {isJoining ? <Spinner className="size-4" /> : "Join"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-brand"
      />
      {label}
    </label>
  );
}
