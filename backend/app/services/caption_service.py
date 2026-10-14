"""Live captions: the room switch, and the transcript saved while it is on.

Speech is turned into text in each speaker's own browser (the Web Speech
API); the server only receives finished text. Nothing is saved while the
host has captions off.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Meeting, TranscriptLine
from app.models.transcript_line import MAX_TRANSCRIPT_LINES
from app.services.record_service import Actor


def set_captions(db: Session, meeting: Meeting, enabled: bool) -> None:
    meeting.captions_on = enabled
    db.commit()


def save_line(db: Session, meeting: Meeting, actor: Actor, text: str) -> TranscriptLine | None:
    """Keep one finished caption. Returns None when it is not saved: captions
    are off (a line that was on its way when the host switched them off), or
    the transcript is full."""
    if not meeting.captions_on:
        return None
    count = db.scalar(select(func.count()).where(TranscriptLine.meeting_id == meeting.id))
    if count >= MAX_TRANSCRIPT_LINES:
        return None
    line = TranscriptLine(
        meeting_id=meeting.id,
        participant_id=actor.participant_id,
        speaker_name=actor.name,
        text=text,
    )
    db.add(line)
    db.commit()
    return line
