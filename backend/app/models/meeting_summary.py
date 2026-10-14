from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.meeting import Meeting


class MeetingSummary(Base):
    """The AI-written summary of a meeting. A meeting has at most one; making
    a new one replaces it."""

    __tablename__ = "meeting_summaries"
    __table_args__ = (UniqueConstraint("meeting_id", name="uq_meeting_summaries_meeting"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    # {"overview": str, "key_points": [...], "decisions": [...], "open_questions": [...]},
    # checked by schemas.summary.SummaryContent before it is saved.
    content: Mapped[dict] = mapped_column(JSON)
    # Which model wrote it, shown under the summary.
    model: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="summary")
