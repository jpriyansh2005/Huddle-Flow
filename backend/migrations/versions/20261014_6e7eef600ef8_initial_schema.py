"""Initial schema: users, sessions, meetings, participants.

Revision ID: 6e7eef600ef8
Revises:
Create Date: 2026-10-14 18:32:15

Written with plain SQLAlchemy types, not the app's own classes, so this file
keeps working whatever later happens to the app code.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "6e7eef600ef8"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _datetime() -> sa.types.TypeEngine:
    """UTC datetimes; MySQL keeps microseconds (see app.db.base.UTCDateTime)."""
    return sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def _token(length: int) -> sa.types.TypeEngine:
    """Case-sensitive on MySQL (see app.db.base.token_column)."""
    return sa.String(length).with_variant(
        mysql.VARCHAR(length, charset="ascii", collation="ascii_bin"), "mysql"
    )


def _enum(name: str, *values: str) -> sa.Enum:
    """A VARCHAR with a CHECK constraint called ``name`` (see app.db.base.enum_column)."""
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=20)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", _datetime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "meetings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=11), nullable=False),
        sa.Column("host_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("kind", _enum("ck_meetings_kind", "instant", "scheduled"), nullable=False),
        sa.Column(
            "status", _enum("ck_meetings_status", "scheduled", "live", "ended"), nullable=False
        ),
        sa.Column("scheduled_start", _datetime(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("started_at", _datetime(), nullable=True),
        sa.Column("ended_at", _datetime(), nullable=True),
        sa.Column("created_at", _datetime(), nullable=False),
        sa.Column("updated_at", _datetime(), nullable=False),
        sa.CheckConstraint(
            "kind != 'scheduled' OR (scheduled_start IS NOT NULL AND duration_minutes IS NOT NULL)",
            name="ck_meetings_scheduled_has_time",
        ),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_meetings_duration_positive",
        ),
        sa.ForeignKeyConstraint(["host_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meetings_code", "meetings", ["code"], unique=True)
    op.create_index("ix_meetings_host_status", "meetings", ["host_id", "status"])

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", _token(64), nullable=False),
        sa.Column("created_at", _datetime(), nullable=False),
        sa.Column("expires_at", _datetime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    op.create_table(
        "participants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("role", _enum("ck_participants_role", "host", "participant"), nullable=False),
        sa.Column("session_token", _token(64), nullable=False),
        sa.Column("joined_at", _datetime(), nullable=False),
        sa.Column("left_at", _datetime(), nullable=True),
        sa.Column("removed_at", _datetime(), nullable=True),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_participants_meeting_id", "participants", ["meeting_id"])
    op.create_index("ix_participants_session_token", "participants", ["session_token"], unique=True)
    op.create_index("ix_participants_user_id", "participants", ["user_id"])


def downgrade() -> None:
    op.drop_table("participants")
    op.drop_table("user_sessions")
    op.drop_table("meetings")
    op.drop_table("users")
