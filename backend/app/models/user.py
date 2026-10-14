from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.user_session import UserSession


class User(Base):
    """An account that can sign in and host meetings."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    # Stored in lower case, so "Ana@X.com" and "ana@x.com" are one account.
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # An Argon2 hash; the password itself is never stored.
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    hosted_meetings: Mapped[list[Meeting]] = relationship(
        back_populates="host", cascade="all, delete-orphan"
    )
    sessions: Mapped[list[UserSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
