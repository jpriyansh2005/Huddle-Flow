"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { Meeting } from "@/lib/types";

type DeleteMeetingDialogProps = {
  meeting: Meeting;
  onClose: () => void;
  onDeleted: () => void;
};

/** Asks before deleting, because a deleted meeting's link stops working. */
export function DeleteMeetingDialog({ meeting, onClose, onDeleted }: DeleteMeetingDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await api.deleteMeeting(meeting.code);
      onDeleted();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      setIsDeleting(false);
    }
  }

  return (
    <Modal title="Delete meeting" onClose={onClose} widthClassName="max-w-[420px]">
      <p className="text-sm text-ink-muted">
        Delete <span className="font-semibold text-ink">{meeting.title}</span>? Its meeting ID and
        invite link will stop working. This can&apos;t be undone.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={isDeleting} className="min-w-20">
          {isDeleting ? <Spinner className="size-4" /> : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}
