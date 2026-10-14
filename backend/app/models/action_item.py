from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.user import User

MAX_ACTION_TEXT_LENGTH = 500
MAX_ACTION_ITEMS_PER_MEETING = 200


class ActionItem(Base):
    """A task agreed in a meeting: what, who, and by when.

    The owner is usually someone in the room. When that person has an account
    the item is linked to it, so it shows up on their own action item list
    after the meeting.
    """

    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(String(MAX_ACTION_TEXT_LENGTH))
    # Who does it: a name (always shown) and, when known, their account.
    owner_name: Mapped[str | None] = mapped_column(String(64))
    owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    due_date: Mapped[date | None] = mapped_column()
    done: Mapped[bool] = mapped_column(default=False)
    created_by_participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, onupdate=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="action_items")
    owner: Mapped[User | None] = relationship()
