"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, inputClassName } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { isValidEmail } from "@/lib/auth";

import { AuthHeading, Divider, PasswordInput, useLeaveIfSignedIn, useNextPath } from "./AuthParts";

type Pending = "login" | "demo" | null;

export function LoginForm() {
  const router = useRouter();
  const next = useNextPath();
  useLeaveIfSignedIn(next);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  async function run(kind: Exclude<Pending, null>, action: () => Promise<unknown>) {
    setPending(kind);
    setError(null);
    try {
      await action();
      router.replace(next);
    } catch (signInError) {
      setError(errorMessage(signInError));
      setPending(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    void run("login", () => api.logIn(email.trim(), password));
  }

  return (
    <>
      <AuthHeading title="Welcome back" subtitle="Sign in to start, join and plan your meetings." />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Email" htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending !== null} className="w-full">
          {pending === "login" ? <Spinner className="size-4" /> : "Sign in"}
        </Button>
      </form>

      <Divider />

      <Button
        variant="outline"
        size="lg"
        disabled={pending !== null}
        onClick={() => void run("demo", api.tryDemo)}
        className="w-full"
      >
        {pending === "demo" ? (
          <Spinner className="size-4" />
        ) : (
          <>
            <Sparkles size={16} className="text-brand" />
            Try the demo account
          </>
        )}
      </Button>
      <p className="mt-2 text-center text-[12px] text-ink-muted">
        A shared account with sample meetings. No sign-up needed.
      </p>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Have a meeting ID?{" "}
        <Link href="/join" className="font-medium text-brand hover:underline">
          Join without an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-ink-muted">
        New to HuddleFlow?{" "}
        <Link
          href={next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
