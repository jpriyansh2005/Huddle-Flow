"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, inputClassName } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/auth";

import { AuthHeading, PasswordInput, useLeaveIfSignedIn, useNextPath } from "./AuthParts";

type Errors = Partial<Record<"name" | "email" | "password" | "form", string>>;

export function SignupForm() {
  const router = useRouter();
  const next = useNextPath();
  useLeaveIfSignedIn(next);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setIsSaving] = useState(false);

  function validate(): Errors {
    const found: Errors = {};
    if (!name.trim()) found.name = "Enter your name.";
    if (!isValidEmail(email)) found.email = "Enter a valid email address.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      found.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    } else if (!password.trim()) {
      found.password = "The password cannot be only spaces.";
    }
    return found;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    try {
      await api.signUp(name.trim(), email.trim(), password);
      router.replace(next);
    } catch (signupError) {
      setErrors({ form: errorMessage(signupError) });
      setIsSaving(false);
    }
  }

  return (
    <>
      <AuthHeading
        title="Create your account"
        subtitle="Host meetings and keep everything in one place."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Name" htmlFor="signup-name" error={errors.name}>
          <input
            id="signup-name"
            autoComplete="name"
            autoFocus
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Work email" htmlFor="signup-email" error={errors.email}>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            maxLength={255}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Password" htmlFor="signup-password" error={errors.password}>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            maxLength={128}
            aria-describedby="signup-password-hint"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {!errors.password && (
            <p id="signup-password-hint" className="mt-1.5 text-[12px] text-ink-muted">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </Field>

        {errors.form && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {errors.form}
          </p>
        )}

        <Button type="submit" size="lg" disabled={isSaving} className="w-full">
          {isSaving ? <Spinner className="size-4" /> : "Create account"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
