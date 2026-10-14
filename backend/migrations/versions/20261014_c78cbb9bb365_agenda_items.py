"""Agenda items: each meeting's planned topics and their live progress.

Revision ID: c78cbb9bb365
Revises: 6e7eef600ef8
Create Date: 2026-10-14 18:51:34
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "c78cbb9bb365"
down_revision: str | Sequence[str] | None = "6e7eef600ef8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _datetime() -> sa.types.TypeEngine:
    return sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "agenda_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("started_at", _datetime(), nullable=True),
        sa.Column("ended_at", _datetime(), nullable=True),
        sa.CheckConstraint("duration_minutes BETWEEN 1 AND 240", name="ck_agenda_items_duration"),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", "position", name="uq_agenda_items_meeting_position"),
    )
    op.create_index("ix_agenda_items_meeting_id", "agenda_items", ["meeting_id"])


def downgrade() -> None:
    op.drop_table("agenda_items")
