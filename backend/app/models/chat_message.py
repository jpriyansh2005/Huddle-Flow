from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.meeting import Meeting

MAX_CHAT_LENGTH = 1000


class ChatMessage(Base):
    """A message sent to everyone in a meeting.

    Kept so that a refresh does not empty the chat and the recap can show it.
    """

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL")
    )
    sender_name: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="chat_messages")
