import type { ReactNode } from "react";

/**
 * Shared look for text inputs, selects and textareas: 40px tall, 12px corners.
 * The base has no width, for controls that sit side by side in a row.
 */
export const inputBaseClassName =
  "h-10 rounded-xl border border-field bg-white px-3.5 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors hover:border-[#9aa1ab] " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

/** The usual form control: the base look, filling the width of its row. */
export const inputClassName = `${inputBaseClassName} w-full`;

type FieldProps = {
  label: string;
  /** The id of the control this label belongs to. */
  htmlFor: string;
  error?: string | null;
  children: ReactNode;
};

/** A labelled form row with room for a validation message. */
export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
