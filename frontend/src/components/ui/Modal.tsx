"use client";

import { X } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class for the dialog. */
  widthClassName?: string;
};

/**
 * A dialog built on the browser's own <dialog> element. `showModal()` gives
 * us the hard parts for free: focus stays inside, Escape closes it, and the
 * page behind cannot be clicked.
 *
 * Render it only while it should be open: {isOpen && <Modal ... />}
 */
export function Modal({ title, onClose, children, widthClassName = "max-w-md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function closeWhenBackdropClicked(event: MouseEvent<HTMLDialogElement>) {
    // The dialog element itself only receives the click when it lands on
    // the backdrop; clicks inside land on the content wrapper below.
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose} // fired by the Escape key
      onClick={closeWhenBackdropClicked}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-[28px] bg-white p-0 text-ink shadow-popover",
        "animate-pop-in backdrop:bg-black/20",
        widthClassName,
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex items-center justify-between px-8 pt-7 pb-4">
          <h2 className="text-xl font-semibold tracking-tight text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-hover"
          >
            <X size={18} />
          </button>
        </header>
        <div className="thin-scrollbar overflow-y-auto px-8 pb-8">{children}</div>
      </div>
    </dialog>
  );
}
