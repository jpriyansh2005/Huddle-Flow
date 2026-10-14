from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.meeting import Meeting

MAX_AGENDA_ITEMS = 20
MAX_ITEM_MINUTES = 240


class AgendaItem(Base):
    """One topic on a meeting's agenda, with its time budget.

    ``started_at`` and ``ended_at`` record what really happened, so the recap
    can compare planned and actual time. The item being discussed is the one
    that has started and not ended; at most one is in that state.
    """

    __tablename__ = "agenda_items"
    __table_args__ = (
        UniqueConstraint("meeting_id", "position", name="uq_agenda_items_meeting_position"),
        CheckConstraint(
            f"duration_minutes BETWEEN 1 AND {MAX_ITEM_MINUTES}",
            name="ck_agenda_items_duration",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    # 0, 1, 2... the order the items are discussed in.
    position: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(200))
    duration_minutes: Mapped[int] = mapped_column()
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    meeting: Mapped[Meeting] = relationship(back_populates="agenda_items")
