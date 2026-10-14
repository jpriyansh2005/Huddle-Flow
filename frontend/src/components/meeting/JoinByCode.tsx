"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, inputClassName } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { parseMeetingInput } from "@/lib/meetingCode";

/**
 * Joining without an account: type a meeting ID or paste an invite link. The
 * meeting is checked here, and the pre-join page then asks for a name.
 */
export function JoinByCode() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const code = parseMeetingInput(input);
    if (!code) return setError("Enter a valid meeting ID or invite link.");

    setIsChecking(true);
    setError(null);
    try {
      const meeting = await api.getMeeting(code);
      if (meeting.status === "ended") {
        setError("This meeting has ended.");
        setIsChecking(false);
        return;
      }
      router.push(`/j/${meeting.code}`);
    } catch (lookupError) {
      setError(errorMessage(lookupError));
      setIsChecking(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6 sm:px-10">
        <Link href="/" aria-label="HuddleFlow home" className="rounded-md">
          <Logo size={30} />
        </Link>
        <Link href="/login" className="text-sm font-medium text-brand hover:underline">
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-[14vh]">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="w-full max-w-[420px] rounded-2xl border border-line bg-white p-7 shadow-card"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-navy">Join a meeting</h1>
          <p className="mt-1.5 mb-6 text-sm text-ink-muted">
            No account needed. You&apos;ll choose your name next.
          </p>

          <Field label="Meeting ID or invite link" htmlFor="join-code" error={error}>
            <input
              id="join-code"
              autoFocus
              autoComplete="off"
              placeholder="864 1234 5678"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setError(null);
              }}
              className={inputClassName}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            disabled={!input.trim() || isChecking}
            className="mt-5 w-full"
          >
            {isChecking ? (
              <Spinner className="size-4" />
            ) : (
              <>
                Continue
                <ArrowRight size={16} />
              </>
            )}
          </Button>
        </form>
      </main>
    </div>
  );
}
