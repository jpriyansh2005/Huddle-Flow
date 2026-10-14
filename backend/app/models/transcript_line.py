from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.meeting import Meeting

MAX_CAPTION_LENGTH = 500
# Roughly ten hours of speech; past this, captions still show but are not saved.
MAX_TRANSCRIPT_LINES = 5000


class TranscriptLine(Base):
    """One finished sentence of live captions, saved while captions are on."""

    __tablename__ = "transcript_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL")
    )
    speaker_name: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(String(MAX_CAPTION_LENGTH))
    spoken_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="transcript_lines")
