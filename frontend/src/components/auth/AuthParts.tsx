"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type InputHTMLAttributes, useEffect, useState } from "react";

import { inputClassName } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { safeNextPath } from "@/lib/auth";

/** Where to go after signing in, taken (safely) from ?next= in the address. */
export function useNextPath(): string {
  return safeNextPath(useSearchParams().get("next"));
}

/** Someone who is already signed in has no business on these pages. */
export function useLeaveIfSignedIn(next: string): void {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    api
      .checkSession()
      .then(() => {
        if (!cancelled) router.replace(next);
      })
      .catch(() => {
        // Not signed in: stay on the form.
      });
    return () => {
      cancelled = true;
    };
  }, [next, router]);
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
    </div>
  );
}

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password field with a button to show what was typed. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${inputClassName} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

/** "or", between the form and the demo button. */
export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[12px] text-ink-faint">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
