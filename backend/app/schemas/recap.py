"""The shape of a meeting recap: everything a meeting produced, on one page."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.meeting import MeetingOut
from app.schemas.meeting_record import ActionItemOut, ChatMessageOut, NoteOut
from app.schemas.summary import SummaryOut, TranscriptLineOut


class AttendeeOut(BaseModel):
    """One person, with all their visits to the meeting added together."""

    name: str
    is_host: bool
    first_joined_at: datetime
    seconds_present: int


class RecapViewerOut(BaseModel):
    """What the person reading the recap may do with it."""

    is_host: bool
    signed_in: bool


class RecapOut(BaseModel):
    meeting: MeetingOut
    attendees: list[AttendeeOut]
    notes: list[NoteOut]
    action_items: list[ActionItemOut]
    chat: list[ChatMessageOut]
    # All messages sent, which can be more than the ones included in `chat`.
    chat_total: int
    # What live captions saved, the latest lines, and how many there are in all.
    transcript: list[TranscriptLineOut]
    transcript_total: int
    summary: SummaryOut | None
    # Whether this server can write summaries (an LLM API key is configured).
    summaries_enabled: bool
    viewer: RecapViewerOut
    # The link that lets anyone read this recap. Only the host receives it.
    share_url: str | None
