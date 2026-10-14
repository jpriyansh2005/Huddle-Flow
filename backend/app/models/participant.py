from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime, enum_column, token_column

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.user import User


class ParticipantRole(enum.StrEnum):
    HOST = "host"
    PARTICIPANT = "participant"


class Participant(Base):
    """One person's attendance in one meeting.

    A row is created each time someone enters a room. Microphone and camera
    state change many times a minute and only matter while the meeting is
    running, so they live in memory in the realtime layer, not here.
    """

    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    # Guests who join from an invite link have no account, so this is nullable.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(64))
    role: Mapped[ParticipantRole] = mapped_column(
        enum_column(ParticipantRole, "ck_participants_role")
    )
    # Random secret handed to the browser on join. It proves who is opening
    # the WebSocket, since guests have no login.
    session_token: Mapped[str] = mapped_column(token_column(64), unique=True, index=True)

    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Set when the host removes someone; a removed participant cannot reconnect.
    removed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship()
