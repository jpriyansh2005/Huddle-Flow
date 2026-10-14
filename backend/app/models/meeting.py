from __future__ import annotations

import enum
import secrets
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime, enum_column, token_column

if TYPE_CHECKING:
    from app.models.action_item import ActionItem
    from app.models.agenda_item import AgendaItem
    from app.models.chat_message import ChatMessage
    from app.models.note import Note
    from app.models.participant import Participant
    from app.models.user import User


class MeetingKind(enum.StrEnum):
    INSTANT = "instant"
    SCHEDULED = "scheduled"


class MeetingStatus(enum.StrEnum):
    SCHEDULED = "scheduled"  # created for a future time, not started yet
    LIVE = "live"  # the host has started it
    ENDED = "ended"  # the host ended it for everyone


class Meeting(Base):
    """A meeting room, either started instantly or scheduled for later."""

    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_meetings_duration_positive",
        ),
        # A scheduled meeting must say when it starts and how long it lasts.
        CheckConstraint(
            "kind != 'scheduled' OR (scheduled_start IS NOT NULL AND duration_minutes IS NOT NULL)",
            name="ck_meetings_scheduled_has_time",
        ),
        # The dashboard lists one host's meetings, filtered by status.
        Index("ix_meetings_host_status", "host_id", "status"),
        UniqueConstraint("recap_key", name="uq_meetings_recap_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # The public "Meeting ID" people type to join, e.g. 86412345678. It is
    # separate from the primary key so the row id never leaks into links.
    code: Mapped[str] = mapped_column(String(11), unique=True, index=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[MeetingKind] = mapped_column(enum_column(MeetingKind, "ck_meetings_kind"))
    status: Mapped[MeetingStatus] = mapped_column(enum_column(MeetingStatus, "ck_meetings_status"))

    # Planned time, set for scheduled meetings only.
    scheduled_start: Mapped[datetime | None] = mapped_column(UTCDateTime)
    duration_minutes: Mapped[int | None] = mapped_column()

    # What actually happened.
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    # The secret in a recap's share link. Whoever has the link can read the
    # recap without an account, like an "anyone with the link" document.
    recap_key: Mapped[str] = mapped_column(
        token_column(64), default=lambda: secrets.token_urlsafe(32)
    )

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, onupdate=utc_now)

    host: Mapped[User] = relationship(back_populates="hosted_meetings")
    participants: Mapped[list[Participant]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    # Loaded together with the meeting (one extra query for a whole list),
    # because every meeting response includes its agenda.
    agenda_items: Mapped[list[AgendaItem]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="AgendaItem.position",
        lazy="selectin",
    )
    # What the meeting produced. Loaded only when asked for.
    notes: Mapped[list[Note]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="Note.id"
    )
    action_items: Mapped[list[ActionItem]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="ActionItem.id"
    )
    chat_messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )

    @property
    def scheduled_end(self) -> datetime | None:
        if self.scheduled_start is None or self.duration_minutes is None:
            return None
        return self.scheduled_start + timedelta(minutes=self.duration_minutes)

    def is_upcoming(self, now: datetime) -> bool:
        """A scheduled meeting stays "upcoming" until its planned end passes."""
        return (
            self.kind == MeetingKind.SCHEDULED
            and self.status != MeetingStatus.ENDED
            and self.scheduled_end is not None
            and self.scheduled_end >= now
        )
